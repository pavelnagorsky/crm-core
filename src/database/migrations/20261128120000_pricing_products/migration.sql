-- Pricing stage 7 (docs/pricing-stage7-api.md): promotions on products, product price changes,
-- discount choice and promo code of a sale, separate client discounts for services and products.
-- New enum values are compared as text below: a value added in this transaction cannot be used yet.

-- AlterEnum
ALTER TYPE "PriceRuleTargetType" ADD VALUE 'PRODUCT';
ALTER TYPE "PriceRuleTargetType" ADD VALUE 'PRODUCT_CATEGORY';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRODUCT_PRICE_CHANGE';

-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PRICE_CHANGE_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PRICE_CHANGE_APPLIED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PRICE_CHANGE_CANCELLED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PRICE_CHANGE_ROLLED_BACK';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PRICES_IMPORTED';

-- PriceRule: appliesToAll splits into services and products.
ALTER TABLE "PriceRule" RENAME COLUMN "appliesToAll" TO "appliesToAllServices";
ALTER TABLE "PriceRule" ADD COLUMN "appliesToAllProducts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_products_check" CHECK (
  "kind" = 'PROMOTION' OR "appliesToAllProducts" = false
);

-- Client: the personal discount splits into services and products.
ALTER TABLE "Client" RENAME COLUMN "discountPercent" TO "servicesDiscountPercent";
ALTER TABLE "Client" RENAME CONSTRAINT "Client_discountPercent_check" TO "Client_servicesDiscountPercent_check";
ALTER TABLE "Client" ADD COLUMN "productsDiscountPercent" DECIMAL(5,2);
ALTER TABLE "Client" ADD CONSTRAINT "Client_productsDiscountPercent_check" CHECK (
  "productsDiscountPercent" IS NULL OR ("productsDiscountPercent" > 0 AND "productsDiscountPercent" <= 100)
);

-- Order: promo code of a sale.
ALTER TABLE "Order" ADD COLUMN "promoCode" VARCHAR(32);

-- OrderItem: discount choice of a product line.
ALTER TABLE "OrderItem" ADD COLUMN "discountChoice" "DiscountChoiceMode",
ADD COLUMN "discountChoiceRuleId" TEXT;

CREATE INDEX "OrderItem_discountChoiceRuleId_idx" ON "OrderItem"("discountChoiceRuleId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discountChoiceRuleId_fkey" FOREIGN KEY ("discountChoiceRuleId") REFERENCES "PriceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AUTO is stored as null; only product lines keep a choice; a rule belongs to RULE only.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discountChoice_check" CHECK (
  ("discountChoice" IS NULL OR ("discountChoice" <> 'AUTO' AND "type" = 'PRODUCT'))
  AND ("discountChoiceRuleId" IS NULL OR "discountChoice" = 'RULE')
);

-- ServicePriceChange* -> PriceChange*: one table for both catalogs, data kept.
ALTER TYPE "ServicePriceChangeSource" RENAME TO "PriceChangeSource";
ALTER TYPE "ServicePriceChangeStatus" RENAME TO "PriceChangeStatus";
ALTER TYPE "ServicePriceChangeTarget" RENAME TO "PriceChangeTarget";
ALTER TYPE "ServicePriceChangeSkip" RENAME TO "PriceChangeSkip";
ALTER TYPE "PriceChangeTarget" ADD VALUE 'PRODUCT';
ALTER TYPE "PriceChangeSkip" ADD VALUE 'NOT_FOR_SALE';

CREATE TYPE "PriceChangeCatalog" AS ENUM ('SERVICES', 'PRODUCTS');

ALTER TABLE "ServicePriceChange" RENAME TO "PriceChange";
ALTER TABLE "PriceChange" RENAME CONSTRAINT "ServicePriceChange_pkey" TO "PriceChange_pkey";
ALTER TABLE "PriceChange" RENAME CONSTRAINT "ServicePriceChange_locationId_fkey" TO "PriceChange_locationId_fkey";
ALTER INDEX "ServicePriceChange_locationId_status_effectiveDate_idx" RENAME TO "PriceChange_locationId_status_effectiveDate_idx";
ALTER INDEX "ServicePriceChange_status_effectiveDate_idx" RENAME TO "PriceChange_status_effectiveDate_idx";
ALTER INDEX "ServicePriceChange_locationId_createdAt_idx" RENAME TO "PriceChange_locationId_createdAt_idx";

ALTER TABLE "PriceChange" ADD COLUMN "catalog" "PriceChangeCatalog" NOT NULL DEFAULT 'SERVICES';
ALTER TABLE "PriceChange" ALTER COLUMN "catalog" DROP DEFAULT;
ALTER TABLE "PriceChange" ADD COLUMN "productsCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PriceChange_locationId_catalog_status_effectiveDate_idx" ON "PriceChange"("locationId", "catalog", "status", "effectiveDate");
CREATE INDEX "PriceChange_locationId_catalog_createdAt_idx" ON "PriceChange"("locationId", "catalog", "createdAt");

ALTER TABLE "ServicePriceChangeItem" RENAME TO "PriceChangeItem";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_pkey" TO "PriceChangeItem_pkey";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_changeId_fkey" TO "PriceChangeItem_changeId_fkey";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_serviceId_fkey" TO "PriceChangeItem_serviceId_fkey";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_priceLevelId_fkey" TO "PriceChangeItem_priceLevelId_fkey";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_staffId_fkey" TO "PriceChangeItem_staffId_fkey";
ALTER TABLE "PriceChangeItem" RENAME CONSTRAINT "ServicePriceChangeItem_bundleId_fkey" TO "PriceChangeItem_bundleId_fkey";
ALTER INDEX "ServicePriceChangeItem_changeId_idx" RENAME TO "PriceChangeItem_changeId_idx";
ALTER INDEX "ServicePriceChangeItem_serviceId_idx" RENAME TO "PriceChangeItem_serviceId_idx";
ALTER INDEX "ServicePriceChangeItem_priceLevelId_idx" RENAME TO "PriceChangeItem_priceLevelId_idx";
ALTER INDEX "ServicePriceChangeItem_staffId_idx" RENAME TO "PriceChangeItem_staffId_idx";
ALTER INDEX "ServicePriceChangeItem_bundleId_idx" RENAME TO "PriceChangeItem_bundleId_idx";

ALTER TABLE "PriceChangeItem" ADD COLUMN "productLocationId" TEXT;
CREATE INDEX "PriceChangeItem_productLocationId_idx" ON "PriceChangeItem"("productLocationId");
ALTER TABLE "PriceChangeItem" ADD CONSTRAINT "PriceChangeItem_productLocationId_fkey" FOREIGN KEY ("productLocationId") REFERENCES "ProductLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extra references are always forbidden; each own reference may become null when its target is deleted.
ALTER TABLE "PriceChangeItem" DROP CONSTRAINT "ServicePriceChangeItem_target_check";
ALTER TABLE "PriceChangeItem" ADD CONSTRAINT "PriceChangeItem_target_check" CHECK (
  ("targetType"::text = 'BASE' AND "priceLevelId" IS NULL AND "staffId" IS NULL AND "bundleId" IS NULL AND "productLocationId" IS NULL)
  OR ("targetType"::text = 'LEVEL' AND "staffId" IS NULL AND "bundleId" IS NULL AND "productLocationId" IS NULL)
  OR ("targetType"::text = 'STAFF' AND "priceLevelId" IS NULL AND "bundleId" IS NULL AND "productLocationId" IS NULL)
  OR ("targetType"::text = 'BUNDLE' AND "serviceId" IS NULL AND "priceLevelId" IS NULL AND "staffId" IS NULL AND "productLocationId" IS NULL)
  OR ("targetType"::text = 'PRODUCT' AND "serviceId" IS NULL AND "priceLevelId" IS NULL AND "staffId" IS NULL AND "bundleId" IS NULL)
);

ALTER TABLE "PriceChangeItem" DROP CONSTRAINT "ServicePriceChangeItem_price_check";
ALTER TABLE "PriceChangeItem" ADD CONSTRAINT "PriceChangeItem_price_check" CHECK (
  ("targetType"::text NOT IN ('BASE', 'BUNDLE', 'PRODUCT') OR "afterPrice" IS NOT NULL)
  AND ("beforePrice" IS NULL OR "beforePrice" >= 0)
  AND ("afterPrice" IS NULL OR "afterPrice" >= 0)
);

COMMENT ON COLUMN "OrderItemPriceAdjustment"."amount" IS 'Signed change of the line total';
