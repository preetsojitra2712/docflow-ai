import dotenv from "dotenv";
import { Client as MinioClient } from "minio";

dotenv.config({ path: "/mnt/g/docflow-ai/.env" });

const endpoint = (process.env.MINIO_ENDPOINT || "localhost").replaceAll('"', "");
const port = Number((process.env.MINIO_PORT || "9000").replaceAll('"', ""));
const accessKey = (process.env.MINIO_ACCESS_KEY || "").replaceAll('"', "");
const secretKey = (process.env.MINIO_SECRET_KEY || "").replaceAll('"', "");
const bucket = (process.env.MINIO_BUCKET || "docflow").replaceAll('"', "");
const useSSL = String(process.env.MINIO_USE_SSL || "false").replaceAll('"', "") === "true";

if (!accessKey || !secretKey) {
  throw new Error("MINIO_ACCESS_KEY or MINIO_SECRET_KEY missing in /mnt/g/docflow-ai/.env");
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
export async function putObject(
  key: string,
  data: Buffer,
  contentType?: string
) {
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
export async function presignGetObject(
  key: string,
  expiresSeconds = 60 * 10
) {
  await ensureBucket();
  return minio.presignedGetObject(MINIO_BUCKET, key, expiresSeconds);
}
