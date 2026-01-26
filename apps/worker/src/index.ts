import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env (repo-level)
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

// Hard fail early if endpoint is malformed (common cause of "Invalid URL: localhost")
const s3Endpoint = process.env.S3_ENDPOINT;
if (!s3Endpoint || !/^https?:\/\//.test(s3Endpoint)) {
  throw new Error(
    `Worker misconfigured: S3_ENDPOINT must be a full URL like http://localhost:9000, got: ${JSON.stringify(
      s3Endpoint
    )}`
  );
}

import { Worker } from "@temporalio/worker";
import * as activities from "./activities.js";

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "docflow";

async function run() {
  const worker = await Worker.create({
    workflowsPath: new URL("./workflows.ts", import.meta.url).pathname,
    activities,
    taskQueue: TASK_QUEUE,
    connectionOptions: { address: TEMPORAL_ADDRESS },
  });

  console.log(
    `[worker] connected to Temporal at ${TEMPORAL_ADDRESS}, taskQueue=${TASK_QUEUE}, s3Endpoint=${process.env.S3_ENDPOINT}`
  );

  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
