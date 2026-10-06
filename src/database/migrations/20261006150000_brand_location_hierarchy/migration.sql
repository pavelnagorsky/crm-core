-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BusinessType') THEN
    CREATE TYPE "BusinessType" AS ENUM ('BARBERSHOP', 'HAIR_SALON', 'NAIL_SALON', 'BEAUTY_SALON', 'SPA', 'MASSAGE', 'COSMETOLOGY', 'TATTOO_PIERCING', 'BROWS_LASHES', 'MEDICAL_CLINIC', 'FITNESS', 'YOGA_STUDIO', 'AUTO_SERVICE', 'PET_GROOMING', 'EDUCATION', 'PHOTO_STUDIO', 'OTHER');
  END IF;
END $$;

-- AlterEnum with legacy audit value remapping.
CREATE TYPE "AuditEntity_new" AS ENUM ('BOOKING', 'BRAND', 'CLIENT', 'LOCATION', 'STAFF', 'SERVICE', 'PAYROLL');
ALTER TABLE "AuditLog" ALTER COLUMN "entityType" TYPE "AuditEntity_new" USING (
  CASE
    WHEN "entityType"::text = 'BUSINESS' THEN 'BRAND'
    ELSE "entityType"::text
  END
)::"AuditEntity_new";
ALTER TYPE "AuditEntity" RENAME TO "AuditEntity_old";
ALTER TYPE "AuditEntity_new" RENAME TO "AuditEntity";
DROP TYPE "AuditEntity_old";

-- AlterEnum with legacy audit event remapping.
CREATE TYPE "AuditEvent_new" AS ENUM ('BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'BOOKING_STATUS_CHANGED', 'BOOKING_DELETED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DELETED', 'STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'STAFF_COMPENSATION_UPDATED', 'STAFF_EARNING_ADDED', 'STAFF_EARNING_REVERSED', 'STAFF_SHIFTS_UPDATED', 'STAFF_BLOCK_CREATED', 'SERVICE_CREATED', 'SERVICE_UPDATED', 'SERVICE_DELETED', 'SERVICE_CATEGORY_CREATED', 'SERVICE_CATEGORY_UPDATED', 'SERVICE_CATEGORY_DELETED', 'SERVICE_BUNDLE_CREATED', 'SERVICE_BUNDLE_UPDATED', 'SERVICE_BUNDLE_DELETED', 'BRAND_UPDATED', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_DELETED', 'PAYROLL_PERIOD_CREATED', 'PAYROLL_PERIOD_DELETED', 'PAYROLL_CALCULATED', 'PAYROLL_APPROVED', 'PAYROLL_PAID', 'PAYROLL_CORRECTED');
ALTER TABLE "AuditLog" ALTER COLUMN "eventType" TYPE "AuditEvent_new" USING (
  CASE
    WHEN "eventType"::text = 'BUSINESS_UPDATED' THEN 'BRAND_UPDATED'
    ELSE "eventType"::text
  END
)::"AuditEvent_new";
ALTER TYPE "AuditEvent" RENAME TO "AuditEvent_old";
ALTER TYPE "AuditEvent_new" RENAME TO "AuditEvent";
DROP TYPE "AuditEvent_old";

-- DropForeignKey
ALTER TABLE "Business" DROP CONSTRAINT "Business_logoFileId_fkey";
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_businessId_fkey";
ALTER TABLE "Client" DROP CONSTRAINT "Client_businessId_fkey";
ALTER TABLE "ServiceCategory" DROP CONSTRAINT "ServiceCategory_businessId_fkey";
ALTER TABLE "Service" DROP CONSTRAINT "Service_businessId_fkey";
ALTER TABLE "ServiceBundle" DROP CONSTRAINT "ServiceBundle_businessId_fkey";
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_businessId_fkey";
ALTER TABLE "StaffInvitation" DROP CONSTRAINT "StaffInvitation_businessId_fkey";
ALTER TABLE "CalendarEvent" DROP CONSTRAINT "CalendarEvent_businessId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_businessId_fkey";
ALTER TABLE "BookingItem" DROP CONSTRAINT "BookingItem_businessId_fkey";
ALTER TABLE "BookingPage" DROP CONSTRAINT "BookingPage_businessId_fkey";
ALTER TABLE "BookingWidget" DROP CONSTRAINT "BookingWidget_businessId_fkey";
ALTER TABLE "StaffCompensationPlan" DROP CONSTRAINT "StaffCompensationPlan_businessId_fkey";
ALTER TABLE "StaffEarning" DROP CONSTRAINT "StaffEarning_businessId_fkey";
ALTER TABLE "PayrollPeriod" DROP CONSTRAINT "PayrollPeriod_businessId_fkey";
ALTER TABLE "PayrollResult" DROP CONSTRAINT "PayrollResult_businessId_fkey";

-- DropIndex
DROP INDEX "Client_businessId_idx";
DROP INDEX "Client_businessId_phone_key";
DROP INDEX "ServiceCategory_businessId_idx";
DROP INDEX "ServiceCategory_businessId_name_key";
DROP INDEX "Service_businessId_idx";
DROP INDEX "ServiceBundle_businessId_idx";
DROP INDEX "Staff_businessId_idx";
DROP INDEX "StaffInvitation_businessId_idx";
DROP INDEX "CalendarEvent_businessId_idx";
DROP INDEX "CalendarEvent_businessId_staffId_idx";
DROP INDEX "CalendarEvent_businessId_repeatType_startDateTime_idx";
DROP INDEX "Booking_businessId_deletedAt_startAt_idx";
DROP INDEX "BookingItem_businessId_idx";
DROP INDEX "BookingPage_businessId_updatedAt_idx";
DROP INDEX "BookingWidget_businessId_updatedAt_idx";
DROP INDEX "BookingWidget_businessId_titleKey_key";
DROP INDEX "AuditLog_businessId_entityType_entityId_idx";
DROP INDEX "AuditLog_businessId_entityType_entityId_createdAt_idx";
DROP INDEX "StaffCompensationPlan_businessId_idx";
DROP INDEX "StaffEarning_businessId_staffId_earnedOn_idx";
DROP INDEX "StaffEarning_businessId_earnedOn_idx";
DROP INDEX "StaffEarning_businessId_idempotencyKey_key";
DROP INDEX "PayrollPeriod_businessId_status_idx";
DROP INDEX "PayrollPeriod_businessId_startDate_endDate_key";
DROP INDEX "PayrollResult_businessId_idx";

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logoFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "businessType" "BusinessType",
    "city" VARCHAR(120),
    "addressLine" VARCHAR(255),
    "advanceBookingWindowDays" INTEGER NOT NULL DEFAULT 60,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "minimumBookingNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bookingVisibility" "BookingVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isBookingConfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationMembership_pkey" PRIMARY KEY ("id")
);

-- Backfill tenant roots and memberships. The old Business id is preserved as both
-- the Brand id and the initial Location id, so existing references can be moved
-- losslessly.
INSERT INTO "Brand" ("id", "name", "logoFileId", "createdAt", "updatedAt")
SELECT "id", "name", "logoFileId", "createdAt", "updatedAt"
FROM "Business";

INSERT INTO "Location" (
    "id",
    "brandId",
    "name",
    "countryCode",
    "currency",
    "timezone",
    "businessType",
    "advanceBookingWindowDays",
    "slotIntervalMinutes",
    "minimumBookingNoticeMinutes",
    "bookingVisibility",
    "isBookingConfirmationRequired",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "id",
    "name",
    CASE
      WHEN "currency" = 'BYN' OR "timezone" = 'Europe/Minsk' THEN 'BY'
      WHEN "currency" = 'RUB' OR "timezone" = 'Europe/Moscow' THEN 'RU'
      WHEN "currency" = 'USD' THEN 'US'
      ELSE 'US'
    END,
    "currency",
    "timezone",
    NULL::"BusinessType",
    "advanceBookingWindowDays",
    "slotIntervalMinutes",
    "minimumBookingNoticeMinutes",
    "bookingVisibility",
    "isBookingConfirmationRequired",
    "createdAt",
    "updatedAt"
FROM "Business";

INSERT INTO "BrandMembership" ("id", "userId", "brandId", "role", "createdAt", "updatedAt")
SELECT "id", "userId", "businessId", "role", "createdAt", "updatedAt"
FROM "Membership";

INSERT INTO "LocationMembership" ("id", "userId", "locationId", "role", "createdAt", "updatedAt")
SELECT "id", "userId", "businessId", "role", "createdAt", "updatedAt"
FROM "Membership";

-- Add replacement scope columns as nullable first, backfill them, then enforce
-- NOT NULL. This keeps existing data valid while the model is split.
ALTER TABLE "Client" ADD COLUMN "brandId" TEXT;
ALTER TABLE "ServiceCategory" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Service" ADD COLUMN "locationId" TEXT;
ALTER TABLE "ServiceBundle" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Staff" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StaffInvitation" ADD COLUMN "locationId" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "locationId" TEXT;
ALTER TABLE "BookingItem" ADD COLUMN "locationId" TEXT;
ALTER TABLE "BookingPage" ADD COLUMN "locationId" TEXT;
ALTER TABLE "BookingWidget" ADD COLUMN "locationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "brandId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StaffCompensationPlan" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StaffEarning" ADD COLUMN "locationId" TEXT;
ALTER TABLE "PayrollPeriod" ADD COLUMN "locationId" TEXT;
ALTER TABLE "PayrollResult" ADD COLUMN "locationId" TEXT;

UPDATE "Client" SET "brandId" = "businessId";
UPDATE "ServiceCategory" SET "locationId" = "businessId";
UPDATE "Service" SET "locationId" = "businessId";
UPDATE "ServiceBundle" SET "locationId" = "businessId";
UPDATE "Staff" SET "locationId" = "businessId";
UPDATE "StaffInvitation" SET "locationId" = "businessId";
UPDATE "CalendarEvent" SET "locationId" = "businessId";
UPDATE "Booking" SET "locationId" = "businessId";
UPDATE "BookingItem" SET "locationId" = "businessId";
UPDATE "BookingPage" SET "locationId" = "businessId";
UPDATE "BookingWidget" SET "locationId" = "businessId";
UPDATE "AuditLog"
SET
  "brandId" = "businessId",
  "locationId" = CASE WHEN "entityType"::text = 'BRAND' THEN NULL ELSE "businessId" END;
UPDATE "StaffCompensationPlan" SET "locationId" = "businessId";
UPDATE "StaffEarning" SET "locationId" = "businessId";
UPDATE "PayrollPeriod" SET "locationId" = "businessId";
UPDATE "PayrollResult" SET "locationId" = "businessId";

ALTER TABLE "Client" ALTER COLUMN "brandId" SET NOT NULL;
ALTER TABLE "ServiceCategory" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "ServiceBundle" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Staff" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "StaffInvitation" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "CalendarEvent" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "BookingItem" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "BookingPage" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "BookingWidget" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "brandId" SET NOT NULL;
ALTER TABLE "StaffCompensationPlan" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "StaffEarning" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "PayrollPeriod" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "PayrollResult" ALTER COLUMN "locationId" SET NOT NULL;

-- Drop old scope columns.
ALTER TABLE "Client" DROP COLUMN "businessId";
ALTER TABLE "ServiceCategory" DROP COLUMN "businessId";
ALTER TABLE "Service" DROP COLUMN "businessId";
ALTER TABLE "ServiceBundle" DROP COLUMN "businessId";
ALTER TABLE "Staff" DROP COLUMN "businessId";
ALTER TABLE "StaffInvitation" DROP COLUMN "businessId";
ALTER TABLE "CalendarEvent" DROP COLUMN "businessId";
ALTER TABLE "Booking" DROP COLUMN "businessId";
ALTER TABLE "BookingItem" DROP COLUMN "businessId";
ALTER TABLE "BookingPage" DROP COLUMN "businessId";
ALTER TABLE "BookingWidget" DROP COLUMN "businessId";
ALTER TABLE "AuditLog" DROP COLUMN "businessId";
ALTER TABLE "StaffCompensationPlan" DROP COLUMN "businessId";
ALTER TABLE "StaffEarning" DROP COLUMN "businessId";
ALTER TABLE "PayrollPeriod" DROP COLUMN "businessId";
ALTER TABLE "PayrollResult" DROP COLUMN "businessId";

-- Drop old root tables after all references have moved.
DROP TABLE "Membership";
DROP TABLE "Business";

-- CreateIndex
CREATE INDEX "Location_brandId_idx" ON "Location"("brandId");
CREATE INDEX "BrandMembership_brandId_idx" ON "BrandMembership"("brandId");
CREATE UNIQUE INDEX "BrandMembership_userId_brandId_key" ON "BrandMembership"("userId", "brandId");
CREATE INDEX "LocationMembership_locationId_idx" ON "LocationMembership"("locationId");
CREATE UNIQUE INDEX "LocationMembership_userId_locationId_key" ON "LocationMembership"("userId", "locationId");
CREATE INDEX "Client_brandId_idx" ON "Client"("brandId");
CREATE UNIQUE INDEX "Client_brandId_phone_key" ON "Client"("brandId", "phone");
CREATE INDEX "ServiceCategory_locationId_idx" ON "ServiceCategory"("locationId");
CREATE UNIQUE INDEX "ServiceCategory_locationId_name_key" ON "ServiceCategory"("locationId", "name");
CREATE INDEX "Service_locationId_idx" ON "Service"("locationId");
CREATE INDEX "ServiceBundle_locationId_idx" ON "ServiceBundle"("locationId");
CREATE INDEX "Staff_locationId_idx" ON "Staff"("locationId");
CREATE INDEX "StaffInvitation_locationId_idx" ON "StaffInvitation"("locationId");
CREATE INDEX "CalendarEvent_locationId_idx" ON "CalendarEvent"("locationId");
CREATE INDEX "CalendarEvent_locationId_staffId_idx" ON "CalendarEvent"("locationId", "staffId");
CREATE INDEX "CalendarEvent_locationId_repeatType_startDateTime_idx" ON "CalendarEvent"("locationId", "repeatType", "startDateTime");
CREATE INDEX "Booking_locationId_deletedAt_startAt_idx" ON "Booking"("locationId", "deletedAt", "startAt");
CREATE INDEX "BookingItem_locationId_idx" ON "BookingItem"("locationId");
CREATE INDEX "BookingPage_locationId_updatedAt_idx" ON "BookingPage"("locationId", "updatedAt");
CREATE INDEX "BookingWidget_locationId_updatedAt_idx" ON "BookingWidget"("locationId", "updatedAt");
CREATE UNIQUE INDEX "BookingWidget_locationId_titleKey_key" ON "BookingWidget"("locationId", "titleKey");
CREATE INDEX "AuditLog_brandId_entityType_entityId_idx" ON "AuditLog"("brandId", "entityType", "entityId");
CREATE INDEX "AuditLog_brandId_entityType_entityId_createdAt_idx" ON "AuditLog"("brandId", "entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_locationId_entityType_entityId_idx" ON "AuditLog"("locationId", "entityType", "entityId");
CREATE INDEX "AuditLog_locationId_entityType_entityId_createdAt_idx" ON "AuditLog"("locationId", "entityType", "entityId", "createdAt");
CREATE INDEX "StaffCompensationPlan_locationId_idx" ON "StaffCompensationPlan"("locationId");
CREATE INDEX "StaffEarning_locationId_staffId_earnedOn_idx" ON "StaffEarning"("locationId", "staffId", "earnedOn");
CREATE INDEX "StaffEarning_locationId_earnedOn_idx" ON "StaffEarning"("locationId", "earnedOn");
CREATE UNIQUE INDEX "StaffEarning_locationId_idempotencyKey_key" ON "StaffEarning"("locationId", "idempotencyKey");
CREATE INDEX "PayrollPeriod_locationId_status_idx" ON "PayrollPeriod"("locationId", "status");
CREATE UNIQUE INDEX "PayrollPeriod_locationId_startDate_endDate_key" ON "PayrollPeriod"("locationId", "startDate", "endDate");
CREATE INDEX "PayrollResult_locationId_idx" ON "PayrollResult"("locationId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBundle" ADD CONSTRAINT "ServiceBundle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingWidget" ADD CONSTRAINT "BookingWidget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCompensationPlan" ADD CONSTRAINT "StaffCompensationPlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
