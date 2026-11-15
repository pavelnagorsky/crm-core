-- Billing phase 3: renewal requests and payments shared by all providers.
-- Provider-specific data goes only to externalId and providerData.

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('BANK_TRANSFER', 'ERIP', 'CASH', 'CARD', 'OTHER', 'NONE');

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" VARCHAR(100) NOT NULL,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "provider" "SubscriptionPaymentProvider" NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "SubscriptionPaymentMethod",
    "externalId" VARCHAR(255),
    "providerData" JSONB,
    "reference" VARCHAR(255),
    "failureReason" VARCHAR(500),
    "ownerComment" VARCHAR(1000),
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByRole" "BillingActorRole" NOT NULL,
    "confirmedById" TEXT,
    "adminNote" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_number_key" ON "SubscriptionPayment"("number");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_brandId_createdAt_id_idx" ON "SubscriptionPayment"("brandId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_status_createdAt_id_idx" ON "SubscriptionPayment"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_status_expiresAt_idx" ON "SubscriptionPayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_provider_externalId_key" ON "SubscriptionPayment"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one open renewal request per subscription.
CREATE UNIQUE INDEX "SubscriptionPayment_one_pending" ON "SubscriptionPayment" ("subscriptionId") WHERE "status" = 'PENDING';

-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_complimentary_check" CHECK (("provider" = 'COMPLIMENTARY') = ("amount" = 0));
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_paid_check" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL));
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_period_check" CHECK ("periodEnd" IS NULL OR "periodEnd" > "periodStart");
