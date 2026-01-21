/*
  Warnings:

  - You are about to drop the column `orgId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Action` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AgentPlan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Approval` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuditEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Extraction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Action" DROP CONSTRAINT "Action_jobId_fkey";

-- DropForeignKey
ALTER TABLE "AgentPlan" DROP CONSTRAINT "AgentPlan_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_actionId_fkey";

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_jobId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Extraction" DROP CONSTRAINT "Extraction_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_orgId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_orgId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "orgId",
DROP COLUMN "role",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "Action";

-- DropTable
DROP TABLE "AgentPlan";

-- DropTable
DROP TABLE "Approval";

-- DropTable
DROP TABLE "AuditEvent";

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "Extraction";

-- DropTable
DROP TABLE "Job";

-- DropTable
DROP TABLE "Organization";

-- DropEnum
DROP TYPE "ActionStatus";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "Role";
