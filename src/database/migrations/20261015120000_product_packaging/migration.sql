BEGIN;

ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PACKAGING_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_PACKAGING_STATUS_CHANGED';

CREATE TABLE "ProductPackaging" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "quantityInBaseUnit" DECIMAL(14,3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPackaging_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPackaging_quantity_positive" CHECK ("quantityInBaseUnit" > 0),
    CONSTRAINT "ProductPackaging_name_not_blank" CHECK (length(trim("name")) > 0),
    CONSTRAINT "ProductPackaging_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductPackaging_productId_name_key" ON "ProductPackaging"("productId", "name");
CREATE INDEX "ProductPackaging_productId_isActive_idx" ON "ProductPackaging"("productId", "isActive");

ALTER TABLE "InventoryBalance"
    ALTER COLUMN "averageUnitCost" TYPE DECIMAL(18,8),
    ADD COLUMN "stockValue" DECIMAL(14,2) NOT NULL DEFAULT 0;
UPDATE "InventoryBalance" SET "stockValue" = ROUND("quantityOnHand" * "averageUnitCost", 2);

ALTER TABLE "InventoryDocumentItem"
    ALTER COLUMN "unitCost" TYPE DECIMAL(18,8),
    ADD COLUMN "totalCost" DECIMAL(14,2),
    ADD COLUMN "packagingId" TEXT,
    ADD COLUMN "packagingName" VARCHAR(100),
    ADD COLUMN "packagingFactor" DECIMAL(14,3),
    ADD COLUMN "packageQuantity" DECIMAL(14,3),
    ADD COLUMN "packageUnitCost" DECIMAL(12,2),
    ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
UPDATE "InventoryDocumentItem" SET "totalCost" = ROUND("quantity" * "unitCost", 2);
WITH positions AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "documentId" ORDER BY "productName", "id") - 1 AS position
    FROM "InventoryDocumentItem"
)
UPDATE "InventoryDocumentItem" i SET "position" = p.position FROM positions p WHERE i.id = p.id;
DROP INDEX "InventoryDocumentItem_documentId_productLocationId_key";
CREATE INDEX "InventoryDocumentItem_documentId_position_idx" ON "InventoryDocumentItem"("documentId", "position");

ALTER TABLE "InventoryMovement"
    ALTER COLUMN "averageUnitCostBefore" TYPE DECIMAL(18,8),
    ALTER COLUMN "averageUnitCostAfter" TYPE DECIMAL(18,8),
    ALTER COLUMN "unitCost" TYPE DECIMAL(18,8),
    ADD COLUMN "stockValueBefore" DECIMAL(14,2),
    ADD COLUMN "stockValueAfter" DECIMAL(14,2),
    ADD COLUMN "sequence" BIGINT;
UPDATE "InventoryMovement" SET
    "stockValueBefore" = ROUND("quantityBefore" * "averageUnitCostBefore", 2),
    "stockValueAfter" = ROUND("quantityAfter" * "averageUnitCostAfter", 2);
CREATE SEQUENCE "InventoryMovement_sequence_seq";
WITH ordered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS sequence FROM "InventoryMovement"
)
UPDATE "InventoryMovement" m SET "sequence" = o.sequence FROM ordered o WHERE m.id = o.id;
SELECT setval('"InventoryMovement_sequence_seq"', COALESCE(MAX("sequence"), 0) + 1, false) FROM "InventoryMovement";
ALTER SEQUENCE "InventoryMovement_sequence_seq" OWNED BY "InventoryMovement"."sequence";
ALTER TABLE "InventoryMovement"
    ALTER COLUMN "sequence" SET DEFAULT nextval('"InventoryMovement_sequence_seq"'),
    ALTER COLUMN "sequence" SET NOT NULL,
    ALTER COLUMN "stockValueBefore" SET NOT NULL,
    ALTER COLUMN "stockValueAfter" SET NOT NULL;
CREATE UNIQUE INDEX "InventoryMovement_sequence_key" ON "InventoryMovement"("sequence");
CREATE INDEX "InventoryMovement_productLocationId_sequence_idx" ON "InventoryMovement"("productLocationId", "sequence");

ALTER TABLE "OrderItem" ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,8);
ALTER TABLE "OrderReturnItem" ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,8);

COMMIT;
