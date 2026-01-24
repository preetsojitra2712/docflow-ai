/*
  Warnings:

  - Added the required column `updatedAt` to the `Document` table without a default value. This is not possible if the table is not empty.

*/

-- Add updatedAt safely (existing rows)
ALTER TABLE "Document" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "Document"
SET "updatedAt" = COALESCE("createdAt", NOW())
WHERE "updatedAt" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Document" ALTER COLUMN "updatedAt" SET DEFAULT NOW();

-- CreateEnum
CREATE TYPE "DocRoute" AS ENUM ('FINANCE', 'HR', 'LEGAL', 'SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELED');

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN "decision" JSONB,
  ADD COLUMN "extracted" JSONB,
  ADD COLUMN "route" "DocRoute";

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "DocRoute" NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_documentId_key" ON "Task"("documentId");

-- CreateIndex
CREATE INDEX "Task_category_idx" ON "Task"("category");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_route_idx" ON "Document"("route");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
