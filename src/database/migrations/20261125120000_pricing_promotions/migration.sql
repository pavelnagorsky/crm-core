-- Pricing stage 4 (docs/pricing-stage4-api.md): promotions, promo codes, personal client discount.
-- CreateEnum
CREATE TYPE "PromotionScenario" AS ENUM ('HAPPY_HOURS', 'LEAD_TIME', 'NEW_CLIENTS', 'BIRTHDAY', 'PROMO_CODE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PromotionChannel" AS ENUM ('ONLINE', 'ADMIN');

-- CreateEnum
CREATE TYPE "PromotionClientFilter" AS ENUM ('ANY', 'NEW', 'BIRTHDAY');

-- CreateEnum
CREATE TYPE "PromotionLimitPeriod" AS ENUM ('ALL_TIME', 'YEAR', 'MONTH', 'WEEK');

-- AlterEnum
ALTER TYPE "PriceRuleKind" ADD VALUE 'PROMOTION';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "promoCode" VARCHAR(32);

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "discountPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "PriceRule" ADD COLUMN     "birthdayWindowDays" INTEGER,
ADD COLUMN     "bookingFrom" DATE,
ADD COLUMN     "bookingTo" DATE,
ADD COLUMN     "channels" "PromotionChannel"[] DEFAULT ARRAY[]::"PromotionChannel"[],
ADD COLUMN     "clientFilter" "PromotionClientFilter" NOT NULL DEFAULT 'ANY',
ADD COLUMN     "maxLeadMinutes" INTEGER,
ADD COLUMN     "minLeadMinutes" INTEGER,
ADD COLUMN     "minVisitTotal" DECIMAL(10,2),
ADD COLUMN     "promoCode" VARCHAR(32),
ADD COLUMN     "publicDescription" VARCHAR(300),
ADD COLUMN     "publicName" VARCHAR(60),
ADD COLUMN     "scenario" "PromotionScenario",
ADD COLUMN     "showAsPromotion" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usageLimitPerClient" INTEGER,
ADD COLUMN     "usageLimitPeriod" "PromotionLimitPeriod",
ADD COLUMN     "usageLimitTotal" INTEGER;

-- CreateTable
CREATE TABLE "PriceRuleStaff" (
    "ruleId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "PriceRuleStaff_pkey" PRIMARY KEY ("ruleId","staffId")
);

-- CreateIndex
CREATE INDEX "PriceRuleStaff_staffId_idx" ON "PriceRuleStaff"("staffId");

-- AddForeignKey
ALTER TABLE "PriceRuleStaff" ADD CONSTRAINT "PriceRuleStaff_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PriceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRuleStaff" ADD CONSTRAINT "PriceRuleStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Checks compare "kind" as text: the new enum value cannot be used in the transaction that adds it.

-- A surcharge has no promotion fields.
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_surcharge_fields_check" CHECK (
  "kind"::text <> 'SURCHARGE' OR (
    "scenario" IS NULL AND "publicName" IS NULL AND "publicDescription" IS NULL
    AND "showAsPromotion" = true AND "bookingFrom" IS NULL AND "bookingTo" IS NULL
    AND "minLeadMinutes" IS NULL AND "maxLeadMinutes" IS NULL
    AND COALESCE(cardinality("channels"), 0) = 0 AND "clientFilter" = 'ANY'
    AND "birthdayWindowDays" IS NULL AND "promoCode" IS NULL
    AND "usageLimitTotal" IS NULL AND "usageLimitPerClient" IS NULL AND "usageLimitPeriod" IS NULL
    AND "minVisitTotal" IS NULL
  )
);

-- A promotion: percent up to 100, at least one channel, a public name, weekly schedule.
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_promotion_fields_check" CHECK (
  "kind"::text <> 'PROMOTION' OR (
    ("valueType" <> 'PERCENT' OR "value" <= 100)
    AND COALESCE(cardinality("channels"), 0) > 0
    AND "publicName" IS NOT NULL AND length(btrim("publicName")) > 0
    AND "scheduleType" = 'WEEKLY' AND "yearly" = false AND "holidayExclusive" = false
  )
);

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_lead_minutes_check" CHECK (
  ("minLeadMinutes" IS NULL OR "minLeadMinutes" >= 0)
  AND ("maxLeadMinutes" IS NULL OR "maxLeadMinutes" >= 0)
);

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_usage_limits_check" CHECK (
  ("usageLimitTotal" IS NULL OR "usageLimitTotal" > 0)
  AND ("usageLimitPerClient" IS NULL OR "usageLimitPerClient" > 0)
  AND (("usageLimitPerClient" IS NULL) = ("usageLimitPeriod" IS NULL))
);

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_birthday_window_check" CHECK (
  (("birthdayWindowDays" IS NULL) = ("clientFilter" <> 'BIRTHDAY'))
  AND ("birthdayWindowDays" IS NULL OR ("birthdayWindowDays" >= 0 AND "birthdayWindowDays" <= 30))
);

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_min_visit_total_check" CHECK (
  "minVisitTotal" IS NULL OR "minVisitTotal" > 0
);

ALTER TABLE "Client" ADD CONSTRAINT "Client_discountPercent_check" CHECK (
  "discountPercent" IS NULL OR ("discountPercent" > 0 AND "discountPercent" <= 100)
);

-- One live promotion per promo code in a location, case-insensitive. Only promotions have a code
-- (surcharge check), so the predicate needs no "kind" (an enum-to-text cast is not immutable).
CREATE UNIQUE INDEX "PriceRule_locationId_promoCode_key" ON "PriceRule" ("locationId", upper("promoCode"))
  WHERE "archivedAt" IS NULL AND "promoCode" IS NOT NULL;
