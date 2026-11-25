-- Pricing stage 6 (docs/pricing-stage6-api.md): scheduled price changes, history, rollback.

-- CreateEnum
CREATE TYPE "ServicePriceChangeSource" AS ENUM ('RULE', 'IMPORT');

-- CreateEnum
CREATE TYPE "ServicePriceChangeStatus" AS ENUM ('SCHEDULED', 'APPLIED', 'CANCELLED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ServicePriceChangeTarget" AS ENUM ('BASE', 'LEVEL', 'STAFF', 'BUNDLE');

-- CreateEnum
CREATE TYPE "ServicePriceChangeSkip" AS ENUM ('TARGET_DELETED', 'STAFF_NOT_ASSIGNED', 'BUNDLE_NOT_FIXED', 'CHANGED_AFTER');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'SERVICE_PRICE_CHANGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICE_CHANGE_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICE_CHANGE_APPLIED';
ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICE_CHANGE_CANCELLED';
ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICE_CHANGE_ROLLED_BACK';
ALTER TYPE "AuditEvent" ADD VALUE 'SERVICE_PRICES_IMPORTED';

-- CreateTable
CREATE TABLE "ServicePriceChange" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "source" "ServicePriceChangeSource" NOT NULL,
    "status" "ServicePriceChangeStatus" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "ruleSpec" JSONB,
    "fileName" VARCHAR(255),
    "servicesCount" INTEGER NOT NULL,
    "bundlesCount" INTEGER NOT NULL,
    "itemsCount" INTEGER NOT NULL,
    "createdServicesCount" INTEGER NOT NULL DEFAULT 0,
    "applySkippedCount" INTEGER NOT NULL DEFAULT 0,
    "rollbackSkippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "rolledBackById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePriceChangeItem" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "targetType" "ServicePriceChangeTarget" NOT NULL,
    "serviceId" TEXT,
    "priceLevelId" TEXT,
    "staffId" TEXT,
    "bundleId" TEXT,
    "targetTitle" VARCHAR(150) NOT NULL,
    "levelName" VARCHAR(60),
    "staffName" VARCHAR(250),
    "beforePrice" DECIMAL(10,2),
    "afterPrice" DECIMAL(10,2),
    "applySkip" "ServicePriceChangeSkip",
    "rollbackSkip" "ServicePriceChangeSkip",
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServicePriceChangeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePriceChange_locationId_status_effectiveDate_idx" ON "ServicePriceChange"("locationId", "status", "effectiveDate");

-- CreateIndex
CREATE INDEX "ServicePriceChange_status_effectiveDate_idx" ON "ServicePriceChange"("status", "effectiveDate");

-- CreateIndex
CREATE INDEX "ServicePriceChange_locationId_createdAt_idx" ON "ServicePriceChange"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "ServicePriceChangeItem_changeId_idx" ON "ServicePriceChangeItem"("changeId");

-- CreateIndex
CREATE INDEX "ServicePriceChangeItem_serviceId_idx" ON "ServicePriceChangeItem"("serviceId");

-- CreateIndex
CREATE INDEX "ServicePriceChangeItem_priceLevelId_idx" ON "ServicePriceChangeItem"("priceLevelId");

-- CreateIndex
CREATE INDEX "ServicePriceChangeItem_staffId_idx" ON "ServicePriceChangeItem"("staffId");

-- CreateIndex
CREATE INDEX "ServicePriceChangeItem_bundleId_idx" ON "ServicePriceChangeItem"("bundleId");

-- AddForeignKey
ALTER TABLE "ServicePriceChange" ADD CONSTRAINT "ServicePriceChange_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ServicePriceChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "PriceLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ServiceBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Extra references are always forbidden; each own reference may become null when its target is deleted.
ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_target_check" CHECK (
  ("targetType" = 'BASE' AND "priceLevelId" IS NULL AND "staffId" IS NULL AND "bundleId" IS NULL)
  OR ("targetType" = 'LEVEL' AND "staffId" IS NULL AND "bundleId" IS NULL)
  OR ("targetType" = 'STAFF' AND "priceLevelId" IS NULL AND "bundleId" IS NULL)
  OR ("targetType" = 'BUNDLE' AND "serviceId" IS NULL AND "priceLevelId" IS NULL AND "staffId" IS NULL)
);

ALTER TABLE "ServicePriceChangeItem" ADD CONSTRAINT "ServicePriceChangeItem_price_check" CHECK (
  ("targetType" NOT IN ('BASE', 'BUNDLE') OR "afterPrice" IS NOT NULL)
  AND ("beforePrice" IS NULL OR "beforePrice" >= 0)
  AND ("afterPrice" IS NULL OR "afterPrice" >= 0)
);
