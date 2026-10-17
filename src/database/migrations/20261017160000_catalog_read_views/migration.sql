-- Keep catalog ordering independent of the database/server default locale.
-- ICU provides the Russian ordering previously performed by Intl.Collator.
CREATE COLLATION "catalog_ru" (provider = icu, locale = 'ru', deterministic = false);

-- Inventory owns this read-only projection. Product metadata is joined here,
-- rather than exposing product tables or loading all products into an inventory service.
CREATE VIEW "InventoryStockView" AS
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
  b."updatedAt"
FROM "ProductLocation" pl
JOIN "Product" p ON p."id" = pl."productId"
LEFT JOIN "InventoryBalance" b ON b."productLocationId" = pl."id"
WHERE pl."trackInventory" = true;

-- Services owns the unified catalog. Aggregate bundle metrics before ordering
-- or pagination, so a page is globally ordered across services and bundles.
CREATE VIEW "ServiceCatalogView" AS
SELECT
  s."id", 'SERVICE'::text AS "kind", s."locationId", s."categoryId",
  c."name" AS "categoryName", s."title", s."description", s."status"::text AS "status",
  s."sortOrder", s."createdAt", s."price", s."durationMinutes"
FROM "Service" s
LEFT JOIN "ServiceCategory" c ON c."id" = s."categoryId"
UNION ALL
SELECT
  b."id", 'BUNDLE'::text AS "kind", b."locationId", b."categoryId",
  c."name" AS "categoryName", b."title", b."description", b."status"::text AS "status",
  b."sortOrder", b."createdAt", COALESCE(b."fixedPrice", metrics."price", 0) AS "price",
  CASE WHEN b."executionMode" = 'PARALLEL'
    THEN COALESCE(metrics."parallelDuration", 0)
    ELSE COALESCE(metrics."sequentialDuration", 0)
  END AS "durationMinutes"
FROM "ServiceBundle" b
LEFT JOIN "ServiceCategory" c ON c."id" = b."categoryId"
LEFT JOIN LATERAL (
  SELECT
    SUM(s."price") AS "price",
    SUM(s."durationMinutes" + s."bufferMinutes") AS "sequentialDuration",
    MAX(s."durationMinutes" + s."bufferMinutes") AS "parallelDuration"
  FROM "ServiceBundleItem" bi
  JOIN "Service" s ON s."id" = bi."serviceId"
  WHERE bi."bundleId" = b."id"
) metrics ON true;
