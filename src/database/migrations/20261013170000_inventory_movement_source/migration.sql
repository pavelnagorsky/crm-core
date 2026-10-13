CREATE TYPE "InventoryMovementSourceType" AS ENUM ('INVENTORY_DOCUMENT', 'ORDER');

ALTER TABLE "InventoryMovement"
  ADD COLUMN "sourceType" "InventoryMovementSourceType",
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceLocationId" TEXT;

UPDATE "InventoryMovement" im
SET
  "sourceType" = 'INVENTORY_DOCUMENT'::"InventoryMovementSourceType",
  "sourceId" = d."id",
  "sourceLocationId" = d."locationId"
FROM "InventoryDocument" d
WHERE im."documentId" = d."id"
  AND im."type" IN (
    'RECEIPT',
    'WRITE_OFF',
    'ADJUSTMENT',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'REVERSAL'
  );

UPDATE "InventoryMovement" im
SET
  "sourceType" = 'ORDER'::"InventoryMovementSourceType",
  "sourceId" = o."id",
  "sourceLocationId" = o."locationId"
FROM "Order" o
WHERE im."orderId" = o."id"
  AND im."type" IN ('SALE', 'SALE_REVERSAL')
  AND im."sourceType" IS NULL;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_source_all_or_none_chk"
  CHECK (
    (
      "sourceType" IS NULL
      AND "sourceId" IS NULL
      AND "sourceLocationId" IS NULL
    )
    OR (
      "sourceType" IS NOT NULL
      AND "sourceId" IS NOT NULL
      AND "sourceLocationId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "InventoryMovement_source_matches_type_chk"
  CHECK (
    "sourceType" IS NULL
    OR (
      "sourceType" = 'INVENTORY_DOCUMENT'
      AND "type" IN (
        'RECEIPT',
        'WRITE_OFF',
        'ADJUSTMENT',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'REVERSAL'
      )
    )
    OR (
      "sourceType" = 'ORDER'
      AND "type" IN ('SALE', 'SALE_REVERSAL')
    )
  );

CREATE INDEX "InventoryMovement_sourceType_sourceId_idx"
  ON "InventoryMovement"("sourceType", "sourceId");

CREATE INDEX "InventoryMovement_sourceLocationId_idx"
  ON "InventoryMovement"("sourceLocationId");
