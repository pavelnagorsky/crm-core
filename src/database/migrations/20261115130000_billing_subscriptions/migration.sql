-- Billing phase 2: brand subscription, history, notice idempotency keys.
-- State (TRIAL / ACTIVE / PAST_DUE / EXPIRED) is computed from dates, not stored.
-- Subscriptions are created by the launch script and BrandService.create, not here.

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('TRIAL_STARTED', 'TRIAL_SKIPPED', 'TRIAL_EXTENDED', 'GRACE_EXTENDED', 'PAYMENT_CREATED', 'PAYMENT_CANCELED', 'PAYMENT_EXPIRED', 'PAYMENT_FAILED', 'PAYMENT_APPLIED', 'PAYMENT_MISMATCH', 'PLAN_CHANGED', 'PERIOD_EXTENDED', 'CUSTOM_TERMS_CHANGED', 'COUNTRY_CHANGED', 'SUSPENDED', 'RESUMED');

-- CreateEnum
CREATE TYPE "SubscriptionNoticeKind" AS ENUM ('TRIAL_ENDING', 'PERIOD_ENDING', 'ACCESS_ENDED', 'ACCESS_LIMITED');

-- CreateEnum
CREATE TYPE "BillingActorRole" AS ENUM ('OWNER', 'ADMIN', 'SYSTEM', 'PROVIDER');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "planId" TEXT,
    "billingPeriod" "BillingPeriod",
    "billingAnchorDay" SMALLINT,
    "trialStartedAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "trialUserId" TEXT,
    "paidUntil" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3) NOT NULL,
    "graceExtendedUntil" TIMESTAMP(3),
    "graceExtendedFor" TIMESTAMP(3),
    "customStaffLimit" INTEGER,
    "customLocationLimit" INTEGER,
    "customCurrency" VARCHAR(3),
    "customMonthlyPrice" DECIMAL(10,2),
    "customYearlyPrice" DECIMAL(10,2),
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "type" "SubscriptionEventType" NOT NULL,
    "actorId" TEXT,
    "actorRole" "BillingActorRole" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionNotice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" "SubscriptionNoticeKind" NOT NULL,
    "anchorAt" TIMESTAMP(3) NOT NULL,
    "daysBefore" SMALLINT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_brandId_key" ON "Subscription"("brandId");

-- CreateIndex
CREATE INDEX "Subscription_accessEndsAt_idx" ON "Subscription"("accessEndsAt");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_id_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionNotice_subscriptionId_kind_anchorAt_daysBefore_key" ON "SubscriptionNotice"("subscriptionId", "kind", "anchorAt", "daysBefore");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionNotice" ADD CONSTRAINT "SubscriptionNotice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One trial per owner user, across all brands including deleted ones.
CREATE UNIQUE INDEX "Subscription_one_trial_per_user" ON "Subscription" ("trialUserId") WHERE "trialUserId" IS NOT NULL;

-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accessEndsAt_trial_check" CHECK ("accessEndsAt" >= "trialEndsAt");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accessEndsAt_paid_check" CHECK ("paidUntil" IS NULL OR "accessEndsAt" >= "paidUntil");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_anchorDay_check" CHECK ("billingAnchorDay" IS NULL OR "billingAnchorDay" BETWEEN 1 AND 31);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_custom_limits_check" CHECK (("customStaffLimit" IS NULL OR "customStaffLimit" >= 1) AND ("customLocationLimit" IS NULL OR "customLocationLimit" >= 1));
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_custom_prices_check" CHECK (("customMonthlyPrice" IS NULL OR "customMonthlyPrice" > 0) AND ("customYearlyPrice" IS NULL OR "customYearlyPrice" > 0) AND (("customMonthlyPrice" IS NULL AND "customYearlyPrice" IS NULL) OR "customCurrency" IS NOT NULL));
ALTER TABLE "SubscriptionNotice" ADD CONSTRAINT "SubscriptionNotice_daysBefore_check" CHECK ("daysBefore" >= 0);
