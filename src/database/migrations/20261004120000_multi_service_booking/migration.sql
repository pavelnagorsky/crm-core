-- CreateEnum
CREATE TYPE "public"."BookingExecutionMode" AS ENUM ('SEQUENTIAL', 'PARALLEL');

-- CreateEnum
CREATE TYPE "public"."BundlePricingMode" AS ENUM ('SUM', 'FIXED');

-- AlterTable
ALTER TABLE "public"."Booking"
  ADD COLUMN "executionMode" "public"."BookingExecutionMode" NOT NULL DEFAULT 'SEQUENTIAL',
  ADD COLUMN "bundleId" TEXT;

-- AlterTable
ALTER TABLE "public"."StaffEarning"
  ADD COLUMN "bookingItemId" TEXT;

-- CreateTable
CREATE TABLE "public"."ServiceBundle" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "categoryId" TEXT,
  "imageFileId" TEXT,
  "title" VARCHAR(150) NOT NULL,
  "description" VARCHAR(2000),
  "executionMode" "public"."BookingExecutionMode" NOT NULL DEFAULT 'SEQUENTIAL',
  "pricingMode" "public"."BundlePricingMode" NOT NULL DEFAULT 'SUM',
  "fixedPrice" DECIMAL(10,2),
  "status" "public"."ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceBundleItem" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "ServiceBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingItem" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "serviceTitle" VARCHAR(150) NOT NULL,
  "serviceDuration" INTEGER NOT NULL,
  "listPrice" DECIMAL(10,2) NOT NULL,
  "chargedPrice" DECIMAL(10,2) NOT NULL,
  "customPrice" DECIMAL(10,2),
  "staffName" VARCHAR(250) NOT NULL,
  "calendarEventId" TEXT,

  CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- Backfill every existing booking into its single migrated item.
INSERT INTO "public"."BookingItem" (
  "id",
  "bookingId",
  "businessId",
  "serviceId",
  "staffId",
  "sortOrder",
  "startAt",
  "endAt",
  "serviceTitle",
  "serviceDuration",
  "listPrice",
  "chargedPrice",
  "customPrice",
  "staffName",
  "calendarEventId"
)
SELECT
  "id",
  "id",
  "businessId",
  "serviceId",
  "staffId",
  0,
  "startAt",
  "endAt",
  "serviceTitle",
  "serviceDuration",
  "servicePrice",
  "servicePrice",
  "customPrice",
  "staffName",
  "calendarEventId"
FROM "public"."Booking";

-- Backfill payroll rows to the migrated single item.
UPDATE "public"."StaffEarning" e
SET "bookingItemId" = i."id"
FROM "public"."BookingItem" i
WHERE e."bookingId" = i."bookingId"
  AND e."bookingItemId" IS NULL;

-- CreateIndex
CREATE INDEX "ServiceBundle_businessId_idx" ON "public"."ServiceBundle"("businessId" ASC);

-- CreateIndex
CREATE INDEX "ServiceBundle_categoryId_idx" ON "public"."ServiceBundle"("categoryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBundleItem_bundleId_serviceId_key" ON "public"."ServiceBundleItem"("bundleId" ASC, "serviceId" ASC);

-- CreateIndex
CREATE INDEX "ServiceBundleItem_bundleId_idx" ON "public"."ServiceBundleItem"("bundleId" ASC);

-- CreateIndex
CREATE INDEX "ServiceBundleItem_serviceId_idx" ON "public"."ServiceBundleItem"("serviceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BookingItem_calendarEventId_key" ON "public"."BookingItem"("calendarEventId" ASC);

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_idx" ON "public"."BookingItem"("bookingId" ASC);

-- CreateIndex
CREATE INDEX "BookingItem_businessId_idx" ON "public"."BookingItem"("businessId" ASC);

-- CreateIndex
CREATE INDEX "BookingItem_staffId_startAt_idx" ON "public"."BookingItem"("staffId" ASC, "startAt" ASC);

-- CreateIndex
CREATE INDEX "BookingItem_serviceId_idx" ON "public"."BookingItem"("serviceId" ASC);

-- CreateIndex
CREATE INDEX "Booking_bundleId_idx" ON "public"."Booking"("bundleId" ASC);

-- CreateIndex
CREATE INDEX "StaffEarning_bookingItemId_idx" ON "public"."StaffEarning"("bookingItemId" ASC);

-- AddForeignKey
ALTER TABLE "public"."ServiceBundle" ADD CONSTRAINT "ServiceBundle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceBundle" ADD CONSTRAINT "ServiceBundle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceBundle" ADD CONSTRAINT "ServiceBundle_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceBundleItem" ADD CONSTRAINT "ServiceBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "public"."ServiceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceBundleItem" ADD CONSTRAINT "ServiceBundleItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "public"."ServiceBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "public"."CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffEarning" ADD CONSTRAINT "StaffEarning_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "public"."BookingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old one-service booking shape after data has been copied.
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_calendarEventId_fkey";
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_serviceId_fkey";
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_staffId_fkey";
DROP INDEX "public"."Booking_calendarEventId_key";
DROP INDEX "public"."Booking_staffId_deletedAt_startAt_idx";
ALTER TABLE "public"."Booking"
  DROP COLUMN "calendarEventId",
  DROP COLUMN "customPrice",
  DROP COLUMN "serviceDuration",
  DROP COLUMN "serviceId",
  DROP COLUMN "servicePrice",
  DROP COLUMN "serviceTitle",
  DROP COLUMN "staffId",
  DROP COLUMN "staffName";
