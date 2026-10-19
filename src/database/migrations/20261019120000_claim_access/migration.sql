BEGIN;

CREATE TEMP TABLE "_ClaimAccessMapping" ("permission" TEXT PRIMARY KEY, "claim" TEXT NOT NULL, "access" TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO "_ClaimAccessMapping" VALUES
  ('brand.read', 'brand', 'read'),
  ('brand.settings.manage', 'brand.settings', 'write'),
  ('location.create', 'location.create', 'write'),
  ('location.read', 'location', 'read'),
  ('location.settings.manage', 'location.settings', 'write'),
  ('access.staff.manage', 'access.staff', 'write'),
  ('access.manager.manage', 'access.manager', 'write'),
  ('access.owner.manage', 'access.owner', 'write'),
  ('access.policy.manage', 'access.policy', 'write'),
  ('calendar.blocks.manage', 'calendar.blocks', 'write'),
  ('booking.read', 'booking', 'read'),
  ('booking.read.own', 'booking.own', 'read'),
  ('booking.manage', 'booking', 'write'),
  ('booking.manage.own', 'booking.own', 'write'),
  ('booking.delete', 'booking.delete', 'write'),
  ('booking.export', 'booking.export', 'read'),
  ('booking.client-token.issue', 'booking.clientToken', 'write'),
  ('order.read', 'order', 'read'),
  ('order.manage', 'order', 'write'),
  ('order.return', 'order.return', 'write'),
  ('order.void', 'order.void', 'write'),
  ('sale.price.override', 'sale.price.override', 'write'),
  ('client.read', 'client', 'read'),
  ('client.manage', 'client', 'write'),
  ('client.ban', 'client.ban', 'write'),
  ('client.import', 'client.import', 'write'),
  ('client.export', 'client.export', 'read'),
  ('product.read', 'product.catalog', 'read'),
  ('product.catalog.manage', 'product.catalog', 'write'),
  ('product.location.read', 'product.location', 'read'),
  ('product.location.manage', 'product.location', 'write'),
  ('service.read', 'service', 'read'),
  ('service.manage', 'service', 'write'),
  ('supplier.read', 'supplier', 'read'),
  ('supplier.manage', 'supplier', 'write'),
  ('inventory.read', 'inventory', 'read'),
  ('inventory.manage', 'inventory', 'write'),
  ('inventory.export', 'inventory.export', 'read'),
  ('staff.read', 'staff', 'read'),
  ('staff.read.own', 'staff.own', 'read'),
  ('staff.manage', 'staff', 'write'),
  ('staff.export', 'staff.export', 'read'),
  ('payroll.read', 'payroll', 'read'),
  ('payroll.read.own', 'payroll.own', 'read'),
  ('payroll.manage', 'payroll', 'write'),
  ('payroll.export', 'payroll.export', 'read'),
  ('booking-channel.read', 'booking-channel', 'read'),
  ('booking-channel.manage', 'booking-channel', 'write'),
  ('analytics.location.read', 'analytics.location', 'read'),
  ('analytics.brand.read', 'analytics.brand', 'read'),
  ('audit.location.read', 'audit.location', 'read'),
  ('audit.brand.read', 'audit.brand', 'read'),
  ('file.brand.manage', 'file.brand', 'write');

ALTER TABLE "BrandPermissionOverride" ADD COLUMN "claim" VARCHAR(100), ADD COLUMN "access" VARCHAR(10);
UPDATE "BrandPermissionOverride" o SET "claim" = m."claim", "access" = m."access" FROM "_ClaimAccessMapping" m WHERE o."permission" = m."permission";
-- Unknown legacy permissions were ignored by the old registry and must not become grants.
DELETE FROM "BrandPermissionOverride" WHERE "claim" IS NULL;
DROP INDEX "BrandPermissionOverride_brandId_role_permission_key";
ALTER TABLE "BrandPermissionOverride" DROP COLUMN "permission", ALTER COLUMN "claim" SET NOT NULL, ALTER COLUMN "access" SET NOT NULL, ADD CONSTRAINT "BrandPermissionOverride_access_check" CHECK ("access" IN ('read', 'write'));
CREATE UNIQUE INDEX "BrandPermissionOverride_brandId_role_claim_access_key" ON "BrandPermissionOverride"("brandId", "role", "claim", "access");

ALTER TABLE "LocationPermissionOverride" ADD COLUMN "claim" VARCHAR(100), ADD COLUMN "access" VARCHAR(10);
UPDATE "LocationPermissionOverride" o SET "claim" = m."claim", "access" = m."access" FROM "_ClaimAccessMapping" m WHERE o."permission" = m."permission";
-- Unknown legacy permissions were ignored by the old registry and must not become grants.
DELETE FROM "LocationPermissionOverride" WHERE "claim" IS NULL;
DROP INDEX "LocationPermissionOverride_locationId_role_permission_key";
ALTER TABLE "LocationPermissionOverride" DROP COLUMN "permission", ALTER COLUMN "claim" SET NOT NULL, ALTER COLUMN "access" SET NOT NULL, ADD CONSTRAINT "LocationPermissionOverride_access_check" CHECK ("access" IN ('read', 'write'));
CREATE UNIQUE INDEX "LocationPermissionOverride_locationId_role_claim_access_key" ON "LocationPermissionOverride"("locationId", "role", "claim", "access");

UPDATE "AccessState" SET "revision" = "revision" + 1;
UPDATE "User" SET "tokenEpoch" = "tokenEpoch" + 1;

COMMIT;
