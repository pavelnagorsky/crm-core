-- Pricing stage 3 (docs/pricing-stage3-api.md): surcharge rules, location price rounding.
-- CreateEnum
CREATE TYPE "PriceRuleKind" AS ENUM ('SURCHARGE');

-- CreateEnum
CREATE TYPE "PriceScheduleType" AS ENUM ('WEEKLY', 'SEASON', 'HOLIDAYS');

-- CreateEnum
CREATE TYPE "PriceRuleTargetType" AS ENUM ('SERVICE', 'SERVICE_CATEGORY', 'BUNDLE');

-- AlterEnum
ALTER TYPE "PriceAdjustmentKind" ADD VALUE 'ROUNDING';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRICE_RULE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'LEVEL_PRICES_FILLED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_ENABLED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_DISABLED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_ARCHIVED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_RULE_RESTORED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRICE_ROUNDING_UPDATED';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "priceRoundingStep" DECIMAL(10,2) NOT NULL DEFAULT 1.00;

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" "PriceRuleKind" NOT NULL,
    "scheduleType" "PriceScheduleType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "note" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "valueType" "PriceValueType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "visitFrom" DATE,
    "visitTo" DATE,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "holidayExclusive" BOOLEAN NOT NULL DEFAULT false,
    "weekdaysMask" INTEGER NOT NULL DEFAULT 0,
    "appliesToAll" BOOLEAN NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRuleTarget" (
    "ruleId" TEXT NOT NULL,
    "targetType" "PriceRuleTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PriceRuleTarget_pkey" PRIMARY KEY ("ruleId","targetType","targetId")
);

-- CreateTable
CREATE TABLE "PriceRuleInterval" (
    "ruleId" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "PriceRuleInterval_pkey" PRIMARY KEY ("ruleId","startMinute")
);

-- CreateTable
CREATE TABLE "PriceRuleDate" (
    "ruleId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "PriceRuleDate_pkey" PRIMARY KEY ("ruleId","date")
);

-- CreateIndex
CREATE INDEX "PriceRule_locationId_archivedAt_idx" ON "PriceRule"("locationId", "archivedAt");

-- CreateIndex
CREATE INDEX "PriceRuleTarget_targetType_targetId_idx" ON "PriceRuleTarget"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "OrderItemPriceAdjustment" ADD CONSTRAINT "OrderItemPriceAdjustment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRuleTarget" ADD CONSTRAINT "PriceRuleTarget_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRuleInterval" ADD CONSTRAINT "PriceRuleInterval_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRuleDate" ADD CONSTRAINT "PriceRuleDate_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItemPriceAdjustment" ADD CONSTRAINT "BookingItemPriceAdjustment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;



ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_value_check" CHECK ("value" > 0);
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_weekdaysMask_check" CHECK ("weekdaysMask" >= 0 AND "weekdaysMask" <= 127);
ALTER TABLE "PriceRuleInterval" ADD CONSTRAINT "PriceRuleInterval_minutes_check" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440);
