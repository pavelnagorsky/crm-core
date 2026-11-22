-- Pricing stage 2 (docs/pricing-plan.md 2.2, 2.3): staff price levels, personal prices, any-staff rule.
-- CreateEnum
CREATE TYPE "AnyStaffRule" AS ENUM ('CHEAPER_AND_FREER', 'LESS_LOADED', 'PRICIER', 'ROUND_ROBIN');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRICE_LEVEL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_LEVEL_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_LEVEL_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_LEVEL_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICES_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'STAFF_PRICES_UPDATED';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "anyStaffEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "anyStaffRule" "AnyStaffRule" NOT NULL DEFAULT 'CHEAPER_AND_FREER';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "priceLevelId" TEXT;

-- AlterTable
ALTER TABLE "StaffService" ADD COLUMN     "price" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PriceLevel" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLevelPrice" (
    "serviceId" TEXT NOT NULL,
    "priceLevelId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ServiceLevelPrice_pkey" PRIMARY KEY ("serviceId","priceLevelId")
);

-- CreateIndex
CREATE INDEX "PriceLevel_locationId_idx" ON "PriceLevel"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceLevel_locationId_name_key" ON "PriceLevel"("locationId", "name");

-- CreateIndex
CREATE INDEX "ServiceLevelPrice_priceLevelId_idx" ON "ServiceLevelPrice"("priceLevelId");

-- CreateIndex
CREATE INDEX "Staff_priceLevelId_idx" ON "Staff"("priceLevelId");

-- AddForeignKey
ALTER TABLE "PriceLevel" ADD CONSTRAINT "PriceLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelPrice" ADD CONSTRAINT "ServiceLevelPrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLevelPrice" ADD CONSTRAINT "ServiceLevelPrice_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "PriceLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "PriceLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One default level per location; it carries the base prices.
CREATE UNIQUE INDEX "PriceLevel_one_default_per_location_key" ON "PriceLevel"("locationId") WHERE "isDefault";

ALTER TABLE "ServiceLevelPrice" ADD CONSTRAINT "ServiceLevelPrice_price_check" CHECK ("price" >= 0);
ALTER TABLE "StaffService" ADD CONSTRAINT "StaffService_price_check" CHECK ("price" IS NULL OR "price" >= 0);
