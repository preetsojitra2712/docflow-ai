import { prisma } from "@docflow/db";

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

export async function fakeProcessDocument(docId: string) {
  await new Promise((r) => setTimeout(r, 2000));
  const doc = await prisma.document.findUnique({ where: { id: docId }, select: { id: true } });
  if (!doc) throw new Error("Document not found");
}
