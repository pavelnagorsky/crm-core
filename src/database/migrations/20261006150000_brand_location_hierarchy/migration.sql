-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('BARBERSHOP', 'HAIR_SALON', 'NAIL_SALON', 'BEAUTY_SALON', 'SPA', 'MASSAGE', 'COSMETOLOGY', 'TATTOO_PIERCING', 'BROWS_LASHES', 'MEDICAL_CLINIC', 'FITNESS', 'YOGA_STUDIO', 'AUTO_SERVICE', 'PET_GROOMING', 'EDUCATION', 'PHOTO_STUDIO', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "AuditEntity_new" AS ENUM ('BOOKING', 'BRAND', 'CLIENT', 'LOCATION', 'STAFF', 'SERVICE', 'PAYROLL');
ALTER TABLE "AuditLog" ALTER COLUMN "entityType" TYPE "AuditEntity_new" USING ("entityType"::text::"AuditEntity_new");
ALTER TYPE "AuditEntity" RENAME TO "AuditEntity_old";
ALTER TYPE "AuditEntity_new" RENAME TO "AuditEntity";
DROP TYPE "AuditEntity_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "AuditEvent_new" AS ENUM ('BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'BOOKING_STATUS_CHANGED', 'BOOKING_DELETED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DELETED', 'STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'STAFF_COMPENSATION_UPDATED', 'STAFF_EARNING_ADDED', 'STAFF_EARNING_REVERSED', 'STAFF_SHIFTS_UPDATED', 'STAFF_BLOCK_CREATED', 'SERVICE_CREATED', 'SERVICE_UPDATED', 'SERVICE_DELETED', 'SERVICE_CATEGORY_CREATED', 'SERVICE_CATEGORY_UPDATED', 'SERVICE_CATEGORY_DELETED', 'SERVICE_BUNDLE_CREATED', 'SERVICE_BUNDLE_UPDATED', 'SERVICE_BUNDLE_DELETED', 'BRAND_UPDATED', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_DELETED', 'PAYROLL_PERIOD_CREATED', 'PAYROLL_PERIOD_DELETED', 'PAYROLL_CALCULATED', 'PAYROLL_APPROVED', 'PAYROLL_PAID', 'PAYROLL_CORRECTED');
ALTER TABLE "AuditLog" ALTER COLUMN "eventType" TYPE "AuditEvent_new" USING ("eventType"::text::"AuditEvent_new");
ALTER TYPE "AuditEvent" RENAME TO "AuditEvent_old";
ALTER TYPE "AuditEvent_new" RENAME TO "AuditEvent";
DROP TYPE "AuditEvent_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Business" DROP CONSTRAINT "Business_logoFileId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_businessId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceCategory" DROP CONSTRAINT "ServiceCategory_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_businessId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceBundle" DROP CONSTRAINT "ServiceBundle_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_businessId_fkey";

-- DropForeignKey
ALTER TABLE "StaffInvitation" DROP CONSTRAINT "StaffInvitation_businessId_fkey";

-- DropForeignKey
ALTER TABLE "CalendarEvent" DROP CONSTRAINT "CalendarEvent_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_businessId_fkey";

-- DropForeignKey
ALTER TABLE "BookingItem" DROP CONSTRAINT "BookingItem_businessId_fkey";

-- DropForeignKey
ALTER TABLE "BookingPage" DROP CONSTRAINT "BookingPage_businessId_fkey";

-- DropForeignKey
ALTER TABLE "BookingWidget" DROP CONSTRAINT "BookingWidget_businessId_fkey";

-- DropForeignKey
ALTER TABLE "StaffCompensationPlan" DROP CONSTRAINT "StaffCompensationPlan_businessId_fkey";

-- DropForeignKey
ALTER TABLE "StaffEarning" DROP CONSTRAINT "StaffEarning_businessId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollPeriod" DROP CONSTRAINT "PayrollPeriod_businessId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollResult" DROP CONSTRAINT "PayrollResult_businessId_fkey";

-- DropIndex
DROP INDEX "Client_businessId_idx";

-- DropIndex
DROP INDEX "Client_businessId_phone_key";

-- DropIndex
DROP INDEX "ServiceCategory_businessId_idx";

-- DropIndex
DROP INDEX "ServiceCategory_businessId_name_key";

-- DropIndex
DROP INDEX "Service_businessId_idx";

-- DropIndex
DROP INDEX "ServiceBundle_businessId_idx";

-- DropIndex
DROP INDEX "Staff_businessId_idx";

-- DropIndex
DROP INDEX "StaffInvitation_businessId_idx";

-- DropIndex
DROP INDEX "CalendarEvent_businessId_idx";

-- DropIndex
DROP INDEX "CalendarEvent_businessId_staffId_idx";

-- DropIndex
DROP INDEX "CalendarEvent_businessId_repeatType_startDateTime_idx";

-- DropIndex
DROP INDEX "Booking_businessId_deletedAt_startAt_idx";

-- DropIndex
DROP INDEX "BookingItem_businessId_idx";

-- DropIndex
DROP INDEX "BookingPage_businessId_updatedAt_idx";

-- DropIndex
DROP INDEX "BookingWidget_businessId_updatedAt_idx";

-- DropIndex
DROP INDEX "BookingWidget_businessId_titleKey_key";

-- DropIndex
DROP INDEX "AuditLog_businessId_entityType_entityId_idx";

-- DropIndex
DROP INDEX "AuditLog_businessId_entityType_entityId_createdAt_idx";

-- DropIndex
DROP INDEX "StaffCompensationPlan_businessId_idx";

-- DropIndex
DROP INDEX "StaffEarning_businessId_staffId_earnedOn_idx";

-- DropIndex
DROP INDEX "StaffEarning_businessId_earnedOn_idx";

-- DropIndex
DROP INDEX "StaffEarning_businessId_idempotencyKey_key";

-- DropIndex
DROP INDEX "PayrollPeriod_businessId_status_idx";

-- DropIndex
DROP INDEX "PayrollPeriod_businessId_startDate_endDate_key";

-- DropIndex
DROP INDEX "PayrollResult_businessId_idx";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "businessId",
ADD COLUMN     "brandId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ServiceCategory" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ServiceBundle" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "StaffInvitation" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CalendarEvent" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BookingItem" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BookingPage" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BookingWidget" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "businessId",
ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "StaffCompensationPlan" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "StaffEarning" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PayrollPeriod" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PayrollResult" DROP COLUMN "businessId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Business";

-- DropTable
DROP TABLE "Membership";

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logoFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "BrandMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_brandId_idx" ON "Location"("brandId");

-- CreateIndex
CREATE INDEX "BrandMembership_brandId_idx" ON "BrandMembership"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMembership_userId_brandId_key" ON "BrandMembership"("userId", "brandId");

-- CreateIndex
CREATE INDEX "LocationMembership_locationId_idx" ON "LocationMembership"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationMembership_userId_locationId_key" ON "LocationMembership"("userId", "locationId");

-- CreateIndex
CREATE INDEX "Client_brandId_idx" ON "Client"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_brandId_phone_key" ON "Client"("brandId", "phone");

-- CreateIndex
CREATE INDEX "ServiceCategory_locationId_idx" ON "ServiceCategory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_locationId_name_key" ON "ServiceCategory"("locationId", "name");

-- CreateIndex
CREATE INDEX "Service_locationId_idx" ON "Service"("locationId");

-- CreateIndex
CREATE INDEX "ServiceBundle_locationId_idx" ON "ServiceBundle"("locationId");

-- CreateIndex
CREATE INDEX "Staff_locationId_idx" ON "Staff"("locationId");

-- CreateIndex
CREATE INDEX "StaffInvitation_locationId_idx" ON "StaffInvitation"("locationId");

-- CreateIndex
CREATE INDEX "CalendarEvent_locationId_idx" ON "CalendarEvent"("locationId");

-- CreateIndex
CREATE INDEX "CalendarEvent_locationId_staffId_idx" ON "CalendarEvent"("locationId", "staffId");

-- CreateIndex
CREATE INDEX "CalendarEvent_locationId_repeatType_startDateTime_idx" ON "CalendarEvent"("locationId", "repeatType", "startDateTime");

-- CreateIndex
CREATE INDEX "Booking_locationId_deletedAt_startAt_idx" ON "Booking"("locationId", "deletedAt", "startAt");

-- CreateIndex
CREATE INDEX "BookingItem_locationId_idx" ON "BookingItem"("locationId");

-- CreateIndex
CREATE INDEX "BookingPage_locationId_updatedAt_idx" ON "BookingPage"("locationId", "updatedAt");

-- CreateIndex
CREATE INDEX "BookingWidget_locationId_updatedAt_idx" ON "BookingWidget"("locationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingWidget_locationId_titleKey_key" ON "BookingWidget"("locationId", "titleKey");

-- CreateIndex
CREATE INDEX "AuditLog_brandId_entityType_entityId_idx" ON "AuditLog"("brandId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_brandId_entityType_entityId_createdAt_idx" ON "AuditLog"("brandId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_locationId_entityType_entityId_idx" ON "AuditLog"("locationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_locationId_entityType_entityId_createdAt_idx" ON "AuditLog"("locationId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffCompensationPlan_locationId_idx" ON "StaffCompensationPlan"("locationId");

-- CreateIndex
CREATE INDEX "StaffEarning_locationId_staffId_earnedOn_idx" ON "StaffEarning"("locationId", "staffId", "earnedOn");

-- CreateIndex
CREATE INDEX "StaffEarning_locationId_earnedOn_idx" ON "StaffEarning"("locationId", "earnedOn");

-- CreateIndex
CREATE UNIQUE INDEX "StaffEarning_locationId_idempotencyKey_key" ON "StaffEarning"("locationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PayrollPeriod_locationId_status_idx" ON "PayrollPeriod"("locationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_locationId_startDate_endDate_key" ON "PayrollPeriod"("locationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollResult_locationId_idx" ON "PayrollResult"("locationId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBundle" ADD CONSTRAINT "ServiceBundle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingWidget" ADD CONSTRAINT "BookingWidget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCompensationPlan" ADD CONSTRAINT "StaffCompensationPlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
