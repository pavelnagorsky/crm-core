BEGIN;

-- Preserve brand/local precedence when STAFF operations become own-booking operations.
INSERT INTO "BrandPermissionOverride" ("id", "brandId", "role", "permission", "allowed")
SELECT gen_random_uuid()::text, "brandId", "role", "permission" || '.own', "allowed"
FROM "BrandPermissionOverride"
WHERE "role" = 'STAFF' AND "permission" IN ('booking.read', 'booking.manage')
ON CONFLICT ("brandId", "role", "permission") DO NOTHING;

INSERT INTO "LocationPermissionOverride" ("id", "locationId", "role", "permission", "allowed")
SELECT gen_random_uuid()::text, "locationId", "role", "permission" || '.own', "allowed"
FROM "LocationPermissionOverride"
WHERE "role" = 'STAFF' AND "permission" IN ('booking.read', 'booking.manage')
ON CONFLICT ("locationId", "role", "permission") DO NOTHING;

-- STAFF can opt into broader reading, but cannot regain administrative or financial actions.
DELETE FROM "BrandPermissionOverride"
WHERE ("role" = 'STAFF' AND "permission" NOT IN (
  'booking.read', 'booking.read.own', 'booking.manage.own', 'client.read', 'staff.read.own', 'payroll.read.own'
)) OR "permission" = 'payroll.manage';

DELETE FROM "LocationPermissionOverride"
WHERE ("role" = 'STAFF' AND "permission" NOT IN (
  'booking.read', 'booking.read.own', 'booking.manage.own', 'staff.read.own', 'payroll.read.own'
)) OR "permission" = 'payroll.manage';

UPDATE "AccessState" SET "revision" = "revision" + 1;
UPDATE "User" SET "tokenEpoch" = "tokenEpoch" + 1;

COMMIT;
