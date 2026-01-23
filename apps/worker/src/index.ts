import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";

import * as activities from "./activities.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "docflow";

async function run() {
const worker = await Worker.create({
  workflowsPath: new URL("./workflows.ts", import.meta.url).pathname,
  activities,
  taskQueue: TASK_QUEUE,
  connectionOptions: { address: TEMPORAL_ADDRESS },
});

  console.log(`[worker] connected to Temporal at ${TEMPORAL_ADDRESS}, taskQueue=${TASK_QUEUE}`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
