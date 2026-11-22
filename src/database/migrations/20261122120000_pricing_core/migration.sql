-- Pricing stage 1 (docs/pricing-plan.md 3.5): price layers on booking items and order lines.

-- CreateEnum
CREATE TYPE "PriceAdjustmentKind" AS ENUM ('LEVEL', 'STAFF', 'SURCHARGE', 'PROMOTION', 'CLIENT_DISCOUNT');

-- CreateEnum
CREATE TYPE "PriceValueType" AS ENUM ('PERCENT', 'AMOUNT');

-- Every booking item so far has one price: the list price is the charged price.
-- The backfill below relies on it, so a different row stops the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "BookingItem" WHERE "listPrice" <> "chargedPrice") THEN
    RAISE EXCEPTION 'BookingItem rows with listPrice <> chargedPrice: price layers cannot be backfilled';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN "basePrice" DECIMAL(10,2),
ADD COLUMN "staffPrice" DECIMAL(10,2),
ADD COLUMN "discountTotal" DECIMAL(10,2);

UPDATE "BookingItem" SET "basePrice" = "listPrice", "staffPrice" = "listPrice", "discountTotal" = 0;

ALTER TABLE "BookingItem" ALTER COLUMN "basePrice" SET NOT NULL,
ALTER COLUMN "staffPrice" SET NOT NULL,
ALTER COLUMN "discountTotal" SET NOT NULL;

ALTER TABLE "BookingItem"
  ADD CONSTRAINT "BookingItem_discount_total_check" CHECK ("discountTotal" >= 0),
  ADD CONSTRAINT "BookingItem_charged_price_check" CHECK ("chargedPrice" = "listPrice" - "discountTotal");

-- AlterTable: the list price of every existing order line is its catalog price.
ALTER TABLE "OrderItem" ADD COLUMN "baseUnitPrice" DECIMAL(10,2);

UPDATE "OrderItem" SET "baseUnitPrice" = "listUnitPrice";

ALTER TABLE "OrderItem" ALTER COLUMN "baseUnitPrice" SET NOT NULL;

-- CreateTable
CREATE TABLE "OrderItemPriceAdjustment" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "kind" "PriceAdjustmentKind" NOT NULL,
    "ruleId" TEXT,
    "title" VARCHAR(150) NOT NULL,
    "publicTitle" VARCHAR(150),
    "valueType" "PriceValueType",
    "value" DECIMAL(10,2),
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderItemPriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItemPriceAdjustment" (
    "id" TEXT NOT NULL,
    "bookingItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "kind" "PriceAdjustmentKind" NOT NULL,
    "ruleId" TEXT,
    "title" VARCHAR(150) NOT NULL,
    "publicTitle" VARCHAR(150),
    "valueType" "PriceValueType",
    "value" DECIMAL(10,2),
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "BookingItemPriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItemPriceAdjustment_orderItemId_idx" ON "OrderItemPriceAdjustment"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderItemPriceAdjustment_ruleId_idx" ON "OrderItemPriceAdjustment"("ruleId");

-- CreateIndex
CREATE INDEX "BookingItemPriceAdjustment_bookingItemId_idx" ON "BookingItemPriceAdjustment"("bookingItemId");

-- CreateIndex
CREATE INDEX "BookingItemPriceAdjustment_ruleId_idx" ON "BookingItemPriceAdjustment"("ruleId");

-- AddForeignKey
ALTER TABLE "OrderItemPriceAdjustment" ADD CONSTRAINT "OrderItemPriceAdjustment_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItemPriceAdjustment" ADD CONSTRAINT "BookingItemPriceAdjustment_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
