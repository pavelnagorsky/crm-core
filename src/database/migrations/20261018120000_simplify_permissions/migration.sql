BEGIN;

CREATE TEMP TABLE "_PermissionMerge" (
  "target" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "managerDefault" BOOLEAN NOT NULL,
  "staffDefault" BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO "_PermissionMerge" VALUES
  ('booking.read', 'booking.read', true, true),
  ('booking.read', 'calendar.read', true, true),
  ('booking.manage', 'booking.create', true, true),
  ('booking.manage', 'booking.update', true, true),
  ('booking.manage', 'booking.status.manage', true, true),
  ('booking.manage', 'booking.cancel', true, true),
  ('order.manage', 'order.create', true, true),
  ('order.manage', 'order.update', true, true),
  ('order.manage', 'order.confirm', true, true),
  ('order.manage', 'order.delete', true, true),
  ('client.manage', 'client.create', true, true),
  ('client.manage', 'client.update', true, false),
  ('product.catalog.manage', 'product.catalog.manage', false, false),
  ('product.catalog.manage', 'product.packaging.manage', false, false);

CREATE TEMP TABLE "_BrandOverridesBeforeMerge" ON COMMIT DROP AS
SELECT * FROM "BrandPermissionOverride";

CREATE TEMP TABLE "_LocationOverridesBeforeMerge" ON COMMIT DROP AS
SELECT * FROM "LocationPermissionOverride";

-- Merging never grants an action that was denied by either original permission.
-- Existing mixed policies become a deny until the owner explicitly enables the group.
WITH scopes AS (
  SELECT DISTINCT o."brandId", o."role", r."target"
  FROM "_BrandOverridesBeforeMerge" o
  JOIN "_PermissionMerge" r ON r."source" = o."permission"
  WHERE (r."target" = 'booking.read' AND o."role" = 'STAFF')
     OR (r."target" IN ('booking.manage', 'order.manage', 'client.manage') AND o."role" IN ('MANAGER', 'STAFF'))
     OR (r."target" = 'product.catalog.manage' AND o."role" = 'MANAGER')
)
INSERT INTO "BrandPermissionOverride" ("id", "brandId", "role", "permission", "allowed")
SELECT gen_random_uuid()::text, s."brandId", s."role", s."target",
       bool_and(COALESCE(o."allowed", CASE WHEN s."role" = 'MANAGER'
         THEN r."managerDefault" ELSE r."staffDefault" END))
FROM scopes s
JOIN "_PermissionMerge" r ON r."target" = s."target"
LEFT JOIN "_BrandOverridesBeforeMerge" o
  ON o."brandId" = s."brandId" AND o."role" = s."role" AND o."permission" = r."source"
GROUP BY s."brandId", s."role", s."target"
ON CONFLICT ("brandId", "role", "permission") DO UPDATE SET "allowed" = EXCLUDED."allowed";

-- Resolve local inheritance against the original brand policy before merging it.
WITH scopes AS (
  SELECT DISTINCT o."locationId", o."role", r."target"
  FROM "_LocationOverridesBeforeMerge" o
  JOIN "_PermissionMerge" r ON r."source" = o."permission"
  WHERE (r."target" = 'booking.read' AND o."role" = 'STAFF')
     OR (r."target" IN ('booking.manage', 'order.manage') AND o."role" IN ('MANAGER', 'STAFF'))
)
INSERT INTO "LocationPermissionOverride" ("id", "locationId", "role", "permission", "allowed")
SELECT gen_random_uuid()::text, s."locationId", s."role", s."target",
       bool_and(COALESCE(local."allowed", brand."allowed", CASE WHEN s."role" = 'MANAGER'
         THEN r."managerDefault" ELSE r."staffDefault" END))
FROM scopes s
JOIN "Location" l ON l."id" = s."locationId"
JOIN "_PermissionMerge" r ON r."target" = s."target"
LEFT JOIN "_LocationOverridesBeforeMerge" local
  ON local."locationId" = s."locationId" AND local."role" = s."role" AND local."permission" = r."source"
LEFT JOIN "_BrandOverridesBeforeMerge" brand
  ON brand."brandId" = l."brandId" AND brand."role" = s."role" AND brand."permission" = r."source"
GROUP BY s."locationId", s."role", s."target"
ON CONFLICT ("locationId", "role", "permission") DO UPDATE SET "allowed" = EXCLUDED."allowed";

-- Booking deletion is an immutable OWNER permission after this deployment.
DELETE FROM "BrandPermissionOverride"
WHERE "permission" IN ('calendar.read', 'order.create', 'order.update', 'order.confirm', 'order.delete', 'booking.create', 'booking.update', 'booking.status.manage', 'booking.cancel', 'client.create', 'client.update', 'product.packaging.manage', 'booking.delete');
DELETE FROM "LocationPermissionOverride"
WHERE "permission" IN ('calendar.read', 'order.create', 'order.update', 'order.confirm', 'order.delete', 'booking.create', 'booking.update', 'booking.status.manage', 'booking.cancel', 'client.create', 'client.update', 'product.packaging.manage', 'booking.delete');

UPDATE "AccessState" SET "revision" = "revision" + 1;
UPDATE "User" SET "tokenEpoch" = "tokenEpoch" + 1;

COMMIT;
