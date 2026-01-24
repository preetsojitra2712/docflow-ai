import { proxyActivities } from "@temporalio/workflow";

type Activities = {
  markProcessing: (docId: string) => Promise<void>;
  markDone: (docId: string) => Promise<void>;
  markFailed: (docId: string, error: string) => Promise<void>;
  agenticMvpProcess: (docId: string) => Promise<void>;
};

const { markProcessing, markDone, markFailed, agenticMvpProcess } = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
});

export async function ingestDocument(docId: string): Promise<void> {
  await markProcessing(docId);

  try {
    await agenticMvpProcess(docId);
    await markDone(docId);
  } catch (e: any) {
    await markFailed(docId, String(e?.message ?? e));
    throw e;
  }
}
