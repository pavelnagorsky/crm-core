-- Billing phase 1: plans, versioned prices per country, single-row settings.
-- See docs/subscriptions-plan.md, sections 3 and 7.

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "BillingPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingPlanPricingMode" AS ENUM ('STANDARD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentProvider" AS ENUM ('OFFLINE', 'COMPLIMENTARY');

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" SMALLINT NOT NULL,
    "status" "BillingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "pricingMode" "BillingPlanPricingMode" NOT NULL DEFAULT 'STANDARD',
    "staffLimit" INTEGER,
    "locationLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultCountryCode" VARCHAR(2) NOT NULL DEFAULT 'BY',
    "trialDays" SMALLINT NOT NULL DEFAULT 30,
    "graceDays" SMALLINT NOT NULL DEFAULT 3,
    "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[],
    "paymentProvider" "SubscriptionPaymentProvider" NOT NULL DEFAULT 'OFFLINE',
    "paymentRequestTtlDays" SMALLINT NOT NULL DEFAULT 14,
    "pendingRequestGraceDays" SMALLINT NOT NULL DEFAULT 3,
    "offlinePaymentInstructions" VARCHAR(5000),
    "adminNotifyEmail" VARCHAR(254),
    "launchedAt" TIMESTAMP(3),
    "enforcementEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_code_key" ON "BillingPlan"("code");

-- CreateIndex
CREATE INDEX "BillingPlan_status_position_idx" ON "BillingPlan"("status", "position");

-- CreateIndex
CREATE INDEX "BillingPlanPrice_countryCode_idx" ON "BillingPlanPrice"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlanPrice_planId_countryCode_billingPeriod_effective_key" ON "BillingPlanPrice"("planId", "countryCode", "billingPeriod", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "BillingPlanPrice" ADD CONSTRAINT "BillingPlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_code_check" CHECK ("code" ~ '^[a-z0-9][a-z0-9-]*$');
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_name_check" CHECK (BTRIM("name") <> '');
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_limits_check" CHECK (("staffLimit" IS NULL OR "staffLimit" >= 1) AND ("locationLimit" IS NULL OR "locationLimit" >= 1));
ALTER TABLE "BillingPlanPrice" ADD CONSTRAINT "BillingPlanPrice_amount_check" CHECK ("amount" > 0);
ALTER TABLE "BillingSettings" ADD CONSTRAINT "BillingSettings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "BillingSettings" ADD CONSTRAINT "BillingSettings_paymentProvider_check" CHECK ("paymentProvider" <> 'COMPLIMENTARY');
ALTER TABLE "BillingSettings" ADD CONSTRAINT "BillingSettings_days_check" CHECK ("trialDays" >= 0 AND "graceDays" >= 0 AND "paymentRequestTtlDays" >= 1 AND "pendingRequestGraceDays" >= 0);

-- Default settings row. Contacts resolve open question #1 of the plan.
INSERT INTO "BillingSettings" ("id", "offlinePaymentInstructions", "updatedAt")
VALUES (
    1,
    'Мы получили запрос и свяжемся с вами в течение рабочего дня. Вопросы по оплате: support@klendo.by. Тариф «Сеть» и договоры: sales@klendo.by.',
    CURRENT_TIMESTAMP
);

-- Seed: plans from the current /pricing page, BY prices in BYN (tax included).
INSERT INTO "BillingPlan" ("id", "code", "name", "position", "pricingMode", "staffLimit", "locationLimit", "updatedAt") VALUES
    (gen_random_uuid()::text, 'master', 'Мастер', 1, 'STANDARD', 1, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'team', 'Команда', 2, 'STANDARD', 5, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'network', 'Сеть', 3, 'CUSTOM', NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO "BillingPlanPrice" ("id", "planId", "countryCode", "currency", "billingPeriod", "amount", "effectiveFrom")
SELECT gen_random_uuid()::text, p."id", 'BY', 'BYN', v."period"::"BillingPeriod", v."amount", DATE_TRUNC('day', CURRENT_TIMESTAMP)
FROM (VALUES
    ('master', 'MONTH', 29.00),
    ('master', 'YEAR', 290.00),
    ('team', 'MONTH', 59.00),
    ('team', 'YEAR', 590.00)
) AS v("code", "period", "amount")
JOIN "BillingPlan" p ON p."code" = v."code";
