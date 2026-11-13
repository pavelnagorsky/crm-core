-- CreateEnum
CREATE TYPE "ClientNoticeType" AS ENUM ('CREATED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "clientNoticeAt" TIMESTAMP(3),
ADD COLUMN     "clientNoticeFromStartAt" TIMESTAMP(3),
ADD COLUMN     "clientNoticeType" "ClientNoticeType",
ADD COLUMN     "notifyClient" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "notifyClientOnStaffChanges" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Booking_clientNoticeAt_idx" ON "Booking"("clientNoticeAt");

