-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "createdIp" TEXT,
ADD COLUMN     "createdUserAgent" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "lastUsedIp" TEXT,
ADD COLUMN     "lastUsedUserAgent" TEXT;
