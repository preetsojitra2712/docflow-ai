import Fastify from "fastify";
import multipart from "@fastify/multipart";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { nanoid } from "nanoid";
import { ensureBucket, minio, MINIO_BUCKET } from "./minio.js";

dotenv.config({ path: "/mnt/g/docflow-ai/.env" });

const fastify = Fastify({ logger: true });

const connectionString = process.env.DATABASE_URL?.replaceAll('"', "");
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Put it in /mnt/g/docflow-ai/.env");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

await ensureBucket();

await fastify.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 }
});

fastify.get("/health", async () => {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
  return { ok: true, db: rows?.[0]?.ok === 1 };
});


fastify.get("/documents", async () => {
  const docs = await prisma.document.findMany({
    take: 50,
    orderBy: { createdAt: "desc" }
  });
  return { ok: true, documents: docs };
});

fastify.get("/documents/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) {
    reply.code(404);
    return { ok: false, error: "Document not found" };
  }
  return { ok: true, document: doc };
});

fastify.get("/documents/:id/download", async (req, reply) => {
  const { id } = req.params as { id: string };

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) {
    reply.code(404);
    return { ok: false, error: "Document not found" };
  }

  const expiresSeconds = 60 * 5;

  const url = await minio.presignedGetObject(
    doc.bucket,
    doc.objectKey,
    expiresSeconds
  );

  return { ok: true, url, expiresSeconds };
});




fastify.post("/upload", async (req, reply) => {
  const part = await req.file();
  if (!part) {
    reply.code(400);
    return { ok: false, error: "No file provided. Use multipart form field name: file" };
  }

  const objectKey = `${Date.now()}_${nanoid(10)}_${part.filename}`;

  await minio.putObject(
    MINIO_BUCKET,
    objectKey,
    part.file,
    part.mimetype ? { "Content-Type": part.mimetype } : undefined
  );

  const doc = await prisma.document.create({
    data: {
      filename: part.filename,
      mimeType: part.mimetype,
      bucket: MINIO_BUCKET,
      objectKey
    }
  });

  return { ok: true, document: doc };
});

const PORT = Number(process.env.API_PORT || 4000);
const HOST = "0.0.0.0";

async function main() {
  await fastify.listen({ port: PORT, host: HOST });
}

main().catch(async (err) => {
  fastify.log.error(err);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
