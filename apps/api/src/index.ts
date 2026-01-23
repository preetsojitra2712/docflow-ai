// apps/api/src/index.ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Connection, Client } from "@temporalio/client";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import csrf from "@fastify/csrf-protection";
import { z } from "zod";

import { prisma } from "@docflow/db";

import { putObject, removeObject, presignGetObject } from "./minio.js";
import { hashPassword, verifyPassword } from "./lib/password.js";
import { newRefreshToken, hashRefreshToken } from "./lib/refreshToken.js";
import { writeAudit } from "./lib/audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load env from apps/api/.env regardless of cwd
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.PORT ?? "4000");
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
const ALLOW_DEV_LOGIN = String(process.env.ALLOW_DEV_LOGIN ?? "true").toLowerCase() === "true";

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30");
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "docflow";

const COOKIE_SECRET = process.env.COOKIE_SECRET ?? "dev-cookie-secret-change-me";
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "docflow_refresh";

function refreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function setRefreshCookie(reply: any, rawRefresh: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, rawRefresh, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: any) {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
}

function getRefreshFromCookie(req: any): string | undefined {
  const cookieVal = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!cookieVal) return undefined;

  const res = req.unsignCookie(cookieVal);
  if (!res.valid) return undefined;

  return typeof res.value === "string" ? res.value : undefined;
}

// Revoke all active refresh tokens for a user (force logout everywhere)
async function revokeAllRefreshTokensForUser(app: any, userId: string) {
  await app.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(app: any, reply: any, req: any, user: { id: string; email: string }) {
  const accessToken = await reply.jwtSign({ sub: user.id, email: user.email }, { expiresIn: JWT_EXPIRES_IN });

  const rawRefresh = newRefreshToken();
  const refreshHash = hashRefreshToken(rawRefresh);

  // Create refresh token row with session metadata
  await app.prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshHash,
      expiresAt: refreshExpiresAt(),
      createdIp: req.ip,
      createdUserAgent: req.headers["user-agent"] ?? null,
      lastUsedAt: new Date(),
      lastUsedIp: req.ip,
      lastUsedUserAgent: req.headers["user-agent"] ?? null,
    },
  });

  setRefreshCookie(reply, rawRefresh);

  return { accessToken, refreshToken: rawRefresh };
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).optional(),
  returnRefreshToken: z.boolean().optional(),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const logoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

async function main() {
  const app = Fastify({ logger: true });
  

  app.decorate("prisma", prisma);
  const temporalConnection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const temporal = new Client({ connection: temporalConnection });

  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  await app.register(jwt, { secret: JWT_SECRET });

  await app.register(cookie, {
    secret: COOKIE_SECRET,
    hook: "onRequest",
  });

  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      path: "/",
    },
  });

  async function requireAuth(req: any, reply: any) {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    }
  }

  async function requireAdmin(req: any, reply: any) {
    await requireAuth(req, reply);
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const u = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!u?.isAdmin) return reply.code(403).send({ ok: false, error: "FORBIDDEN" });
  }

  // Health
  app.get("/health", async (_req, reply) => {
    const rows = await app.prisma.$queryRawUnsafe("SELECT 1 as ok");
    return reply.send({ ok: true, db: rows });
  });

  // CSRF token endpoint
  app.get("/auth/csrf", async (_req, reply) => {
    const token = await reply.generateCsrf();
    return reply.send({ ok: true, csrfToken: token });
  });

  // Register
  app.post("/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);

    const existing = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ ok: false, error: "EMAIL_ALREADY_EXISTS" });

    const passwordHash = await hashPassword(body.password);

    const user = await app.prisma.user.create({
      data: { email: body.email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    await writeAudit(app, req, {
      action: "auth.register",
      userId: user.id,
      meta: { email: user.email },
    });

    return reply.code(201).send({ ok: true, user });
  });

  // Login
  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const user = await app.prisma.user.findUnique({ where: { email: body.email } });

    // user does not exist
    if (!user) {
      if (!ALLOW_DEV_LOGIN) return reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });

      const created = await app.prisma.user.create({
        data: { email: body.email, passwordHash: null },
        select: { id: true, email: true },
      });

      const tokens = await issueTokens(app, reply, req, created);

      await writeAudit(app, req, {
        action: "auth.login",
        userId: created.id,
        meta: { method: "dev", email: created.email },
      });

      return reply.send({
        ok: true,
        accessToken: tokens.accessToken,
        ...(body.returnRefreshToken ? { refreshToken: tokens.refreshToken } : {}),
      });
    }

    // password user
    if (user.passwordHash) {
      if (!body.password) return reply.code(400).send({ ok: false, error: "PASSWORD_REQUIRED" });

      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) return reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });

      const tokens = await issueTokens(app, reply, req, { id: user.id, email: user.email });

      await writeAudit(app, req, {
        action: "auth.login",
        userId: user.id,
        meta: { method: "password", email: user.email },
      });

      return reply.send({
        ok: true,
        accessToken: tokens.accessToken,
        ...(body.returnRefreshToken ? { refreshToken: tokens.refreshToken } : {}),
      });
    }

    // dev user
    if (!ALLOW_DEV_LOGIN) return reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });

    const tokens = await issueTokens(app, reply, req, { id: user.id, email: user.email });

    await writeAudit(app, req, {
      action: "auth.login",
      userId: user.id,
      meta: { method: "dev", email: user.email },
    });

    return reply.send({
      ok: true,
      accessToken: tokens.accessToken,
      ...(body.returnRefreshToken ? { refreshToken: tokens.refreshToken } : {}),
    });
  });

  // Refresh (CSRF protected)
  app.post("/auth/refresh", { preHandler: (app as any).csrfProtection }, async (req, reply) => {
    const body = refreshBodySchema.parse(req.body);

    const refreshToken = body.refreshToken ?? getRefreshFromCookie(req);
    if (!refreshToken) return reply.code(400).send({ ok: false, error: "REFRESH_TOKEN_REQUIRED" });

    const tokenHash = hashRefreshToken(refreshToken);

    const row = await app.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!row) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ ok: false, error: "INVALID_REFRESH_TOKEN" });
    }

    // Reuse detection
    if (row.revokedAt) {
      await revokeAllRefreshTokensForUser(app, row.userId);
      clearRefreshCookie(reply);

      await writeAudit(app, req, {
        action: "auth.refresh.reuse_detected",
        userId: row.userId,
        meta: {
          userId: row.userId,
          reason: "refresh token reused after rotation/revocation",
        },
      });

      return reply.code(401).send({ ok: false, error: "REFRESH_TOKEN_REUSE_DETECTED" });
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ ok: false, error: "REFRESH_TOKEN_EXPIRED" });
    }

    // Mark last used on the current refresh token
    await app.prisma.refreshToken.update({
      where: { id: row.id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: req.ip,
        lastUsedUserAgent: req.headers["user-agent"] ?? null,
      },
    });

    const newRaw = newRefreshToken();
    const newHash = hashRefreshToken(newRaw);

    // Create rotated refresh token row with metadata
    const newRow = await app.prisma.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: newHash,
        expiresAt: refreshExpiresAt(),
        createdIp: req.ip,
        createdUserAgent: req.headers["user-agent"] ?? null,
        lastUsedAt: new Date(),
        lastUsedIp: req.ip,
        lastUsedUserAgent: req.headers["user-agent"] ?? null,
      },
      select: { id: true },
    });

    await app.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedById: newRow.id },
    });

    setRefreshCookie(reply, newRaw);

    const accessToken = await reply.jwtSign({ sub: row.user.id, email: row.user.email }, { expiresIn: JWT_EXPIRES_IN });

    await writeAudit(app, req, {
      action: "auth.refresh",
      userId: row.userId,
    });

    return reply.send({ ok: true, accessToken });
  });

  // Logout (CSRF protected)
  app.post("/auth/logout", { preHandler: (app as any).csrfProtection }, async (req, reply) => {
    const body = logoutBodySchema.parse(req.body);

    const refreshToken = body.refreshToken ?? getRefreshFromCookie(req);

    let userIdForAudit: string | null = null;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      const row = await app.prisma.refreshToken.findUnique({ where: { tokenHash } });

      if (row) userIdForAudit = row.userId;

      if (row && !row.revokedAt) {
        await app.prisma.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    clearRefreshCookie(reply);

    await writeAudit(app, req, {
      action: "auth.logout",
      userId: userIdForAudit,
    });

    return reply.send({ ok: true });
  });

  // Sessions: list active sessions (protected) + mark current session
  app.get("/auth/sessions", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const currentRaw = getRefreshFromCookie(req);
    const currentHash = currentRaw ? hashRefreshToken(currentRaw) : null;

    const rows = await app.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tokenHash: true,
        createdAt: true,
        expiresAt: true,
        createdIp: true,
        createdUserAgent: true,
        lastUsedAt: true,
        lastUsedIp: true,
        lastUsedUserAgent: true,
      },
    });

    const sessions = rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      createdIp: s.createdIp,
      createdUserAgent: s.createdUserAgent,
      lastUsedAt: s.lastUsedAt,
      lastUsedIp: s.lastUsedIp,
      lastUsedUserAgent: s.lastUsedUserAgent,
      isCurrent: currentHash ? s.tokenHash === currentHash : false,
    }));

    return reply.send({ ok: true, sessions });
  });

  // Sessions: revoke one session (protected)
  app.delete("/auth/sessions/:id", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const id = req.params.id as string;
    const currentRaw = getRefreshFromCookie(req);
const currentHash = currentRaw ? hashRefreshToken(currentRaw) : null;

if (currentHash) {
  const current = await app.prisma.refreshToken.findUnique({
    where: { tokenHash: currentHash },
    select: { id: true },
  });

  if (current?.id === id) {
    return reply.code(400).send({ ok: false, error: "CANNOT_REVOKE_CURRENT_SESSION" });
  }
}

    const row = await app.prisma.refreshToken.findFirst({
      where: { id, userId },
      select: { id: true, revokedAt: true },
    });

    if (!row) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });

    if (!row.revokedAt) {
      await app.prisma.refreshToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    }

    await writeAudit(app, req, {
      action: "auth.session.revoke",
      userId,
      meta: { refreshTokenId: id },
    });

    return reply.send({ ok: true });
  });

  // Sessions: revoke all other sessions except current (protected)
  app.delete("/auth/sessions", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const currentRaw = getRefreshFromCookie(req);
    const currentHash = currentRaw ? hashRefreshToken(currentRaw) : null;

    const res = await app.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    await writeAudit(app, req, {
      action: "auth.session.revoke_all_others",
      userId,
      meta: { revokedCount: res.count },
    });

    return reply.send({ ok: true, revoked: res.count });
  });

  // Admin audit
  app.get("/admin/audit", { preHandler: requireAdmin }, async (req: any, reply) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const rows = await app.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: q.limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ip: true,
        userAgent: true,
        meta: true,
        createdAt: true,
        userId: true,
      },
    });

    return reply.send({ ok: true, audit: rows });
  });

  // Upload (protected)
  app.post("/upload", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const mp = await req.file();
    if (!mp) return reply.code(400).send({ ok: false, error: "NO_FILE" });

    const buf = await mp.toBuffer();
    const filename = mp.filename;
    const mimeType = mp.mimetype ?? null;
    const size = buf.length;

    const bucket = process.env.MINIO_BUCKET ?? "docflow";
    const objectKey = crypto.randomUUID();

    const doc = await app.prisma.document.create({
      data: {
        userId,
        filename,
        mimeType,
        size,
        bucket,
        objectKey,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        bucket: true,
        objectKey: true,
        size: true,
        createdAt: true,
        status: true,
        processedAt: true,
        error: true,
      },
      
    });

    await putObject(doc.objectKey, buf, mimeType ?? undefined);

    await temporal.workflow.start("ingestDocument", {
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: `doc-ingest-${doc.id}`,
      args: [doc.id],
    });
    

    await writeAudit(app, req, {
      action: "document.upload",
      userId,
      entityType: "Document",
      entityId: doc.id,
      meta: {
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        bucket: doc.bucket,
        objectKey: doc.objectKey,
      },
    });

    return reply.send({ ok: true, document: doc });
  });

  // List documents (protected)
  app.get("/documents", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const docs = await app.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        bucket: true,
        objectKey: true,
        size: true,
        createdAt: true,
      },
    });

    return reply.send({ ok: true, documents: docs });
  });

  // Get document by id (protected)
  app.get("/documents/:id", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const id = req.params.id as string;

    const doc = await app.prisma.document.findFirst({
      where: { id, userId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        bucket: true,
        objectKey: true,
        size: true,
        createdAt: true,
      },
    });

    if (!doc) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });

    return reply.send({ ok: true, document: doc });
  });

  // Document status (protected)
app.get("/documents/:id/status", { preHandler: requireAuth }, async (req: any, reply) => {
  const userId = req.user?.sub as string | undefined;
  if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

  const id = req.params.id as string;

  const doc = await app.prisma.document.findFirst({
    where: { id, userId },
    select: { id: true, status: true, processedAt: true, error: true },
  });

  if (!doc) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });

  return reply.send({ ok: true, status: doc });
});


  // Download (protected)
  app.get("/documents/:id/download", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const id = req.params.id as string;

    const doc = await app.prisma.document.findFirst({
      where: { id, userId },
      select: { objectKey: true },
    });

    if (!doc) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });

    await writeAudit(app, req, {
      action: "document.download",
      userId,
      entityType: "Document",
      entityId: id,
    });

    const url = await presignGetObject(doc.objectKey);
    return reply.send({ ok: true, url });
  });

  // Delete (protected)
  app.delete("/documents/:id", { preHandler: requireAuth }, async (req: any, reply) => {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });

    const id = req.params.id as string;

    const doc = await app.prisma.document.findFirst({
      where: { id, userId },
      select: { id: true, objectKey: true },
    });

    if (!doc) return reply.code(404).send({ ok: false, error: "NOT_FOUND" });

    await removeObject(doc.objectKey);
    await app.prisma.document.delete({ where: { id: doc.id } });

    await writeAudit(app, req, {
      action: "document.delete",
      userId,
      entityType: "Document",
      entityId: id,
    });

    return reply.send({ ok: true });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
    csrfProtection: any;
  }
}
