-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'REVIEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_VISIBILITY_CHANGED';
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_REPLIED';
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_REPLY_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'REVIEW_DELETED';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "googleReviewUrl" VARCHAR(2048),
ADD COLUMN     "reviewsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "yandexReviewUrl" VARCHAR(2048);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reviewRequestSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "clientId" TEXT,
    "rating" SMALLINT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "authorFirstName" VARCHAR(100),
    "authorLastName" VARCHAR(100),
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenAt" TIMESTAMP(3),
    "hiddenReason" VARCHAR(500),
    "replyText" VARCHAR(2000),
    "repliedAt" TIMESTAMP(3),
    "repliedByName" VARCHAR(250),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewStaff" (
    "reviewId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" VARCHAR(250) NOT NULL,

    CONSTRAINT "ReviewStaff_pkey" PRIMARY KEY ("reviewId","staffId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_locationId_status_reviewedAt_id_idx" ON "Review"("locationId", "status", "reviewedAt", "id");

-- CreateIndex
CREATE INDEX "Review_clientId_idx" ON "Review"("clientId");

-- CreateIndex
CREATE INDEX "ReviewStaff_staffId_idx" ON "ReviewStaff"("staffId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStaff" ADD CONSTRAINT "ReviewStaff_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStaff" ADD CONSTRAINT "ReviewStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CheckConstraint
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
