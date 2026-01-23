import { proxyActivities } from "@temporalio/workflow";

type Activities = {
  markProcessing: (docId: string) => Promise<void>;
  markDone: (docId: string) => Promise<void>;
  markFailed: (docId: string, error: string) => Promise<void>;
  fakeProcessDocument: (docId: string) => Promise<void>;
};

const { markProcessing, markDone, markFailed, fakeProcessDocument } = proxyActivities<Activities>({
  startToCloseTimeout: "2 minutes",
});

export async function ingestDocument(docId: string): Promise<void> {
  await markProcessing(docId);

  try {
    await fakeProcessDocument(docId);
    await markDone(docId);
  } catch (e: any) {
    await markFailed(docId, String(e?.message ?? e));
    throw e;
  }
}
