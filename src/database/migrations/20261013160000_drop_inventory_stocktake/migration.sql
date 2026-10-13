-- STOCKTAKE (inventory count) is no longer a warehouse document or movement type.
-- Existing rows must be removed first: rewriting posted stock would change balances.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "InventoryDocument" WHERE "type"::text = 'STOCKTAKE'
  ) THEN
    RAISE EXCEPTION 'Cannot drop STOCKTAKE: InventoryDocument rows still use it';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "InventoryMovement" WHERE "type"::text = 'STOCKTAKE'
  ) THEN
    RAISE EXCEPTION 'Cannot drop STOCKTAKE: InventoryMovement rows still use it';
  END IF;
END $$;

ALTER TYPE "InventoryDocumentType" RENAME TO "InventoryDocumentType_old";
CREATE TYPE "InventoryDocumentType" AS ENUM ('RECEIPT', 'WRITE_OFF', 'ADJUSTMENT', 'TRANSFER');
ALTER TABLE "InventoryDocument"
  ALTER COLUMN "type" TYPE "InventoryDocumentType"
  USING ("type"::text::"InventoryDocumentType");
DROP TYPE "InventoryDocumentType_old";

ALTER TYPE "InventoryMovementType" RENAME TO "InventoryMovementType_old";
CREATE TYPE "InventoryMovementType" AS ENUM (
  'RECEIPT',
  'WRITE_OFF',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'SALE',
  'SALE_REVERSAL',
  'REVERSAL'
);
ALTER TABLE "InventoryMovement"
  ALTER COLUMN "type" TYPE "InventoryMovementType"
  USING ("type"::text::"InventoryMovementType");
DROP TYPE "InventoryMovementType_old";
