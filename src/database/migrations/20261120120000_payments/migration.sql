-- Payments of visits and product sales: an additive money journal per order.
-- See docs/payments-plan.md. No backfill: closed visits and sales without records show
-- "payment not specified".

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PAYMENT', 'REFUND');

-- AlterEnum: audit events of the order history
ALTER TYPE "AuditEvent" ADD VALUE 'PAYMENT_RECORDED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYMENT_REPLACED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYMENT_VOIDED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYMENT_REFUNDED';

-- CreateTable
CREATE TABLE "PaymentOperation" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "orderReturnId" TEXT,
    "replacesOperationId" TEXT,
    "reason" VARCHAR(500),
    "createdById" TEXT,
    "createdByName" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdByName" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedByName" VARCHAR(300),
    "voidReason" VARCHAR(500),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOperation_orderReturnId_key" ON "PaymentOperation"("orderReturnId");

-- CreateIndex
CREATE INDEX "PaymentOperation_orderId_idx" ON "PaymentOperation"("orderId");

-- CreateIndex
CREATE INDEX "PaymentOperation_replacesOperationId_idx" ON "PaymentOperation"("replacesOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOperation_locationId_idempotencyKey_key" ON "PaymentOperation"("locationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_locationId_occurredAt_idx" ON "Payment"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_operationId_idx" ON "Payment"("operationId");

-- AddForeignKey
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_orderReturnId_fkey" FOREIGN KEY ("orderReturnId") REFERENCES "OrderReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_replacesOperationId_fkey" FOREIGN KEY ("replacesOperationId") REFERENCES "PaymentOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "PaymentOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Amounts are always positive; the type gives the direction.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0);

-- A refund may belong to a product return; only a payment replaces another payment.
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_return_refund_check"
  CHECK ("orderReturnId" IS NULL OR "type" = 'REFUND');
ALTER TABLE "PaymentOperation" ADD CONSTRAINT "PaymentOperation_replaces_payment_check"
  CHECK ("replacesOperationId" IS NULL OR "type" = 'PAYMENT');

-- At most one active cash and one active card payment record per order, so at most one
-- active payment operation. Refunds and voided records are not limited.
CREATE UNIQUE INDEX "Payment_active_payment_method_key" ON "Payment"("orderId", "method")
  WHERE "type" = 'PAYMENT' AND "voidedAt" IS NULL;
