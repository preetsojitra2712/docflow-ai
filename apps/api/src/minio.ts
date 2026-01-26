import dotenv from "dotenv";
import { Client as MinioClient } from "minio";

dotenv.config({ path: "/mnt/g/docflow-ai/.env" });

function clean(v: string | undefined): string {
  return (v ?? "").replaceAll('"', "").trim();
}

function parseMinioEndpoint(raw: string, fallbackPort: number): { endPoint: string; port: number; useSSLFromUrl?: boolean } {
  const v = clean(raw);
  if (!v) return { endPoint: "localhost", port: fallbackPort };

  // Accept:
  // - http://localhost:9000
  // - https://minio.example.com
  // - localhost:9000
  // - localhost
  if (v.startsWith("http://") || v.startsWith("https://")) {
    const u = new URL(v);
    const endPoint = u.hostname;
    const port = u.port ? Number(u.port) : fallbackPort;
    const useSSLFromUrl = u.protocol === "https:";
    return { endPoint, port, useSSLFromUrl };
  }

  // Strip any path/query if someone passed localhost:9000/something
  const noPath = v.split("/")[0];

  // host:port form
  if (noPath.includes(":")) {
    const [host, portStr] = noPath.split(":");
    const port = portStr ? Number(portStr) : fallbackPort;
    return { endPoint: host, port };
  }

  return { endPoint: noPath, port: fallbackPort };
}

const fallbackPort = Number(clean(process.env.MINIO_PORT) || "9000");
const parsed = parseMinioEndpoint(process.env.MINIO_ENDPOINT, fallbackPort);

const endpoint = parsed.endPoint;
const port = parsed.port;

const accessKey = clean(process.env.MINIO_ACCESS_KEY);
const secretKey = clean(process.env.MINIO_SECRET_KEY);
const bucket = clean(process.env.MINIO_BUCKET) || "docflow";

// If MINIO_USE_SSL is explicitly set, use it.
// Otherwise, if MINIO_ENDPOINT was a URL, infer from scheme.
const useSSLExplicit = clean(process.env.MINIO_USE_SSL);
const useSSL =
  useSSLExplicit
    ? useSSLExplicit === "true"
    : Boolean(parsed.useSSLFromUrl);

if (!accessKey || !secretKey) {
  throw new Error("MINIO_ACCESS_KEY or MINIO_SECRET_KEY missing in /mnt/g/docflow-ai/.env or environment");
}

export const minio = new MinioClient({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey,
  secretKey,
});

export const MINIO_BUCKET = bucket;

export async function ensureBucket() {
  const exists = await minio.bucketExists(MINIO_BUCKET);
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET);
  }
}

// Upload object bytes to MinIO under the given key
export async function putObject(key: string, data: Buffer, contentType?: string) {
  await ensureBucket();
  const meta = contentType ? { "Content-Type": contentType } : undefined;
  await minio.putObject(MINIO_BUCKET, key, data, data.length, meta as any);
}

// Delete object by key
export async function removeObject(key: string) {
  await ensureBucket();
  await minio.removeObject(MINIO_BUCKET, key);
}

// Presigned GET URL for download
export async function presignGetObject(key: string, expiresSeconds = 60 * 10) {
  await ensureBucket();
  return minio.presignedGetObject(MINIO_BUCKET, key, expiresSeconds);
}

