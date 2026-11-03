BEGIN;

UPDATE "Location" SET "businessType" = NULL WHERE "businessType" = 'OTHER';

ALTER TYPE "BusinessType" RENAME TO "BusinessType_old";

CREATE TYPE "BusinessType" AS ENUM (
    'BARBERSHOP',
    'HAIR_SALON',
    'NAIL_SALON',
    'BEAUTY_SALON',
    'SPA',
    'MASSAGE',
    'COSMETOLOGY',
    'TATTOO_PIERCING',
    'BROWS_LASHES',
    'MEDICAL_CLINIC',
    'FITNESS',
    'YOGA_STUDIO',
    'AUTO_SERVICE',
    'PET_GROOMING',
    'EDUCATION',
    'PHOTO_STUDIO'
);

ALTER TABLE "Location"
    ALTER COLUMN "businessType" TYPE "BusinessType"
    USING ("businessType"::text::"BusinessType");

DROP TYPE "BusinessType_old";

COMMIT;
