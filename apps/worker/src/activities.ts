import { prisma } from "@docflow/db";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function streamToString(body: any): Promise<string> {
  // In AWS SDK v3, Body can be a stream in Node.
  const stream = body as Readable;
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT || process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || "minioadmin",
  },
});

type ExtractedPayload = {
  ok: true;
  text: string;
  method: "txt" | "pdf_stub" | "unknown_stub";
  notes?: string;
};

type DecisionPayload = {
  ok: true;
  category: "FINANCE" | "HR" | "LEGAL" | "SUPPORT" | "OTHER";
  confidence: number;
  reason: string;
  signals: string[];
};

function decideRoute(text: string): DecisionPayload {
  const t = (text || "").toLowerCase();

  // Very small, demoable heuristic router.
  const rules: Array<{ cat: DecisionPayload["category"]; signals: string[]; confidence: number }> = [
    { cat: "FINANCE", signals: ["invoice", "payment", "amount", "usd", "bank", "wire", "tax", "receipt", "billing"], confidence: 0.82 },
    { cat: "HR", signals: ["resume", "cv", "candidate", "interview", "offer", "salary", "onboarding", "termination"], confidence: 0.80 },
    { cat: "LEGAL", signals: ["agreement", "contract", "nda", "liability", "terms", "privacy", "compliance", "lawsuit"], confidence: 0.83 },
    { cat: "SUPPORT", signals: ["issue", "error", "bug", "crash", "cannot", "help", "support", "ticket"], confidence: 0.78 },
  ];

  const hits: Array<{ cat: DecisionPayload["category"]; matched: string[]; confidence: number }> = [];
  for (const r of rules) {
    const matched = r.signals.filter((s) => t.includes(s));
    if (matched.length > 0) hits.push({ cat: r.cat, matched, confidence: r.confidence });
  }

  if (hits.length === 0) {
    return {
      ok: true,
      category: "OTHER",
      confidence: 0.55,
      reason: "No strong routing keywords detected. Defaulting to OTHER.",
      signals: [],
    };
  }

  // Pick best by number of matched signals, then by confidence.
  hits.sort((a, b) => (b.matched.length - a.matched.length) || (b.confidence - a.confidence));
  const best = hits[0];

  const reason =
    `Matched keywords for ${best.cat}: ` +
    best.matched.slice(0, 6).join(", ") +
    (best.matched.length > 6 ? "..." : "");

  // Slightly scale confidence by matches, capped.
  const scaled = Math.min(0.95, best.confidence + Math.min(0.12, best.matched.length * 0.02));

  return {
    ok: true,
    category: best.cat,
    confidence: Number(scaled.toFixed(2)),
    reason,
    signals: best.matched,
  };
}

async function extractTextFromMinio(docId: string): Promise<ExtractedPayload> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, filename: true, mimeType: true, bucket: true, objectKey: true },
  });
  if (!doc) throw new Error("Document not found");

  const filename = doc.filename || "";
  const mime = (doc.mimeType || "").toLowerCase();

  const looksTxt = mime.includes("text/plain") || filename.toLowerCase().endsWith(".txt");
  const looksPdf = mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf");

  if (!looksTxt && !looksPdf) {
    return { ok: true, text: "", method: "unknown_stub", notes: "Unsupported type for MVP. Only .txt is fully supported. PDF is stubbed." };
  }

  if (looksPdf) {
    // Minimal stub for MVP (demoable route decision can still run, but text is empty).
    return { ok: true, text: "", method: "pdf_stub", notes: "PDF parsing is stubbed in MVP. Add real parser later (pdf-parse, tika, etc.)." };
  }

  // .txt: download from MinIO and read as UTF-8
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: doc.bucket,
      Key: doc.objectKey,
    })
  );

  const text = out.Body ? await streamToString(out.Body) : "";
  return { ok: true, text, method: "txt" };
}

export async function markProcessing(docId: string) {
  await prisma.document.update({
    where: { id: docId },
    data: { status: "PROCESSING", error: null },
  });
}

export async function markDone(docId: string) {
  await prisma.document.update({
    where: { id: docId },
    data: { status: "DONE", processedAt: new Date(), error: null },
  });
}

export async function markFailed(docId: string, error: string) {
  await prisma.document.update({
    where: { id: docId },
    data: { status: "FAILED", error },
  });
}

export async function agenticMvpProcess(docId: string) {
  // 1) Load doc (need userId for audit and task)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, userId: true, filename: true },
  });
  if (!doc) throw new Error("Document not found");

  // 2) Extract
  const extracted = await extractTextFromMinio(docId);

  // 3) Decide
  const decision = decideRoute(extracted.text);

  // 4) Persist extracted + decision + route
  await prisma.document.update({
    where: { id: docId },
    data: {
      extracted,
      decision,
      route: decision.category,
    },
  });

  // 5) Create Task (one per doc)
  const task = await prisma.task.upsert({
    where: { documentId: docId },
    create: {
      documentId: docId,
      userId: doc.userId,
      category: decision.category,
      reason: decision.reason,
      confidence: decision.confidence,
      meta: {
        signals: decision.signals,
        method: extracted.method,
        filename: doc.filename,
      },
    },
    update: {
      category: decision.category,
      reason: decision.reason,
      confidence: decision.confidence,
      meta: {
        signals: decision.signals,
        method: extracted.method,
        filename: doc.filename,
      },
    },
    select: { id: true },
  });

  // 6) Audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        userId: doc.userId,
        action: "AGENT_DECISION",
        entityType: "Document",
        entityId: docId,
        meta: {
          decision,
        },
      },
      {
        userId: doc.userId,
        action: "TASK_CREATED",
        entityType: "Task",
        entityId: task.id,
        meta: {
          documentId: docId,
          taskId: task.id,
        },
      },
    ],
  });
}

