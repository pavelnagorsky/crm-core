-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_IMPORT_COMPLETED';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "importKey" VARCHAR(140),
ADD COLUMN     "source" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "Review_locationId_importKey_key" ON "Review"("locationId", "importKey");
