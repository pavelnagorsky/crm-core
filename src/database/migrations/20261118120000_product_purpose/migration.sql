-- Products are either sold to clients, consumed internally, or both.
-- Existing products keep their previous behaviour: sold, not internal.
ALTER TABLE "Product"
  ADD COLUMN "isForSale" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isForInternalUse" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "Product_purpose_check" CHECK ("isForSale" OR "isForInternalUse");

-- Internal-only products have no retail price.
ALTER TABLE "ProductLocation" ALTER COLUMN "retailPrice" DROP NOT NULL;

-- New columns are appended: CREATE OR REPLACE VIEW only allows adding columns at the end.
CREATE OR REPLACE VIEW "InventoryStockView" AS
SELECT
  pl."locationId",
  pl."id" AS "productLocationId",
  pl."productId",
  p."name",
  p."sku",
  p."barcode",
  p."unit",
  COALESCE(b."quantityOnHand", 0) AS "quantityOnHand",
  COALESCE(b."averageUnitCost", 0) AS "averageUnitCost",
  COALESCE(b."stockValue", 0) AS "stockValue",
  pl."reorderLevel",
  COALESCE(b."quantityOnHand", 0) <= pl."reorderLevel" AS "lowStock",
  COALESCE(b."quantityOnHand", 0) <= 0 AS "outOfStock",
  b."updatedAt",
  p."isForSale",
  p."isForInternalUse"
FROM "ProductLocation" pl
JOIN "Location" stock_location ON stock_location."id" = pl."locationId"
JOIN "Brand" stock_brand ON stock_brand."id" = stock_location."brandId"
JOIN "Product" p ON p."id" = pl."productId"
LEFT JOIN "InventoryBalance" b ON b."productLocationId" = pl."id"
WHERE pl."trackInventory" = true
  AND stock_location."deletedAt" IS NULL AND stock_brand."deletedAt" IS NULL;
