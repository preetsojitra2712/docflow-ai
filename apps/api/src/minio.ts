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
  secretKey
});

export const MINIO_BUCKET = bucket;

export async function ensureBucket() {
  const exists = await minio.bucketExists(MINIO_BUCKET);
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET);
  }
}
