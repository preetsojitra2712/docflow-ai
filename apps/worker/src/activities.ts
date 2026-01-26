import { prisma } from "@docflow/db";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

// NOTE: We are using pdfjs-dist for minimal PDF text extraction (no OCR).
// It is already installed in your worker.
type ExtractedPayload = {
  ok: true;
  text: string;
  method: "txt" | "pdf" | "unknown_stub";
  notes?: string;
};

type DecisionPayload = {
  ok: true;
  category: "FINANCE" | "HR" | "LEGAL" | "SUPPORT" | "OTHER";
  confidence: number;
  reason: string;
  signals: string[];
};

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function streamToBuffer(body: any): Promise<Buffer> {
  const stream = body as Readable;
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function streamToString(body: any): Promise<string> {
  const buf = await streamToBuffer(body);
  return buf.toString("utf8");
}

function getS3Endpoint(): string {
  const direct = process.env.S3_ENDPOINT;
  if (direct && /^https?:\/\//.test(direct)) return direct;

  const host = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  const useSsl = (process.env.MINIO_USE_SSL ?? "false").toLowerCase() === "true";
  const proto = useSsl ? "https" : "http";
  return `${proto}://${host}:${port}`;
}

function getS3Credentials(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId =
    process.env.S3_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.MINIO_ACCESS_KEY ||
    process.env.MINIO_ROOT_USER;

  const secretAccessKey =
    process.env.S3_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.MINIO_SECRET_KEY ||
    process.env.MINIO_ROOT_PASSWORD;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Worker misconfigured: missing S3/MinIO credentials. Set MINIO_ACCESS_KEY + MINIO_SECRET_KEY (or S3_ACCESS_KEY + S3_SECRET_KEY) in root .env.`
    );
  }

  return { accessKeyId, secretAccessKey };
}

const s3 = new S3Client({
  endpoint: getS3Endpoint(),
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() === "true",
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: getS3Credentials(),
});

function decideRoute(text: string): DecisionPayload {
  const t = (text || "").toLowerCase();

  const rules: Array<{ cat: DecisionPayload["category"]; signals: string[]; confidence: number }> = [
    { cat: "FINANCE", signals: ["invoice", "payment", "amount", "usd", "bank", "wire", "tax", "receipt", "billing"], confidence: 0.82 },
    { cat: "HR", signals: ["resume", "cv", "candidate", "interview", "offer", "salary", "onboarding", "termination"], confidence: 0.8 },
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

  hits.sort((a, b) => (b.matched.length - a.matched.length) || (b.confidence - a.confidence));
  const best = hits[0];

  const reason =
    `Matched keywords for ${best.cat}: ` +
    best.matched.slice(0, 6).join(", ") +
    (best.matched.length > 6 ? "..." : "");

  const scaled = Math.min(0.95, best.confidence + Math.min(0.12, best.matched.length * 0.02));

  return {
    ok: true,
    category: best.cat,
    confidence: Number(scaled.toFixed(2)),
    reason,
    signals: best.matched,
  };
}

async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  // ESM import works with your pdfjs-dist version
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Avoid worker requirement in Node environment
  // We set a dummy workerSrc (pdfjs checks this in some paths)
  // In practice, parsing here runs without actual worker threads.

  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;

  let out = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = (content.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter((s) => s.trim().length > 0);

    if (strings.length > 0) {
      out += strings.join(" ") + "\n";
    }
  }

  return out.trim();
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
    return { ok: true, text: "", method: "unknown_stub", notes: "Unsupported type for MVP. Only .txt and PDF text are supported." };
  }

  const out = await s3.send(
    new GetObjectCommand({
      Bucket: doc.bucket,
      Key: doc.objectKey,
    })
  );

  if (!out.Body) {
    return { ok: true, text: "", method: looksPdf ? "pdf" : "txt", notes: "Object body was empty." };
  }

  if (looksTxt) {
    const text = await streamToString(out.Body);
    return { ok: true, text, method: "txt" };
  }

  // PDF: read bytes and parse text (no OCR)
  const buf = await streamToBuffer(out.Body);

  try {
    const text = await extractTextFromPdfBytes(new Uint8Array(buf));
    return {
      ok: true,
      text,
      method: "pdf",
      notes: "Parsed text from PDF (no OCR). Some PDFs may contain no extractable text.",
    };
  } catch (e: any) {
    // Make the error message clean and stable
    const msg = String(e?.message ?? e);
    throw new Error(msg.includes("Invalid PDF") ? "Invalid PDF structure." : msg);
  }
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

// --- Optional "fail once then succeed" demo switch ---
const failOnceSeen = new Set<string>();

function shouldFailOnce(docId: string): boolean {
  const target = (process.env.FAIL_ONCE_FOR_DOC_ID || "").trim();
  if (!target) return false;
  if (target !== docId) return false;
  if (failOnceSeen.has(docId)) return false;
  failOnceSeen.add(docId);
  return true;
}

export async function agenticMvpProcess(docId: string) {
  try {
    // 1) Mark PROCESSING
    await markProcessing(docId);

    // 2) Load doc
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, userId: true, filename: true },
    });
    if (!doc) throw new Error("Document not found");

    // 3) Extract
    const extracted = await extractTextFromMinio(docId);

    // 4) Decide
    const decision = decideRoute(extracted.text);

    // 5) Persist extracted + decision + route
    await prisma.document.update({
      where: { id: docId },
      data: {
        extracted,
        decision,
        route: decision.category,
      },
    });

    // 6) Create / update task
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

    // 7) Audit logs
    await prisma.auditLog.createMany({
      data: [
        {
          userId: doc.userId,
          action: "AGENT_DECISION",
          entityType: "Document",
          entityId: docId,
          meta: { decision },
        },
        {
          userId: doc.userId,
          action: "TASK_CREATED",
          entityType: "Task",
          entityId: task.id,
          meta: { documentId: docId, taskId: task.id },
        },
      ],
    });

    // 8) Mark DONE
    await markDone(docId);
  } catch (err: any) {
    // Mark FAILED
    await markFailed(docId, String(err?.message ?? err));
    throw err;
  }
}

