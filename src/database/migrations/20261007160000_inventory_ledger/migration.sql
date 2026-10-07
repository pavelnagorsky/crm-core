-- CreateEnum
CREATE TYPE "InventoryDocumentType" AS ENUM ('RECEIPT', 'WRITE_OFF', 'ADJUSTMENT', 'STOCKTAKE', 'TRANSFER');
CREATE TYPE "InventoryDocumentStatus" AS ENUM ('OPEN', 'POSTED', 'VOIDED');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'WRITE_OFF', 'ADJUSTMENT', 'STOCKTAKE', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'SALE_REVERSAL', 'REVERSAL');

-- ExtendEnum
ALTER TYPE "AuditEntity" ADD VALUE 'INVENTORY';
ALTER TYPE "AuditEvent" ADD VALUE 'INVENTORY_DOCUMENT_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'INVENTORY_DOCUMENT_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'INVENTORY_DOCUMENT_POSTED';
ALTER TYPE "AuditEvent" ADD VALUE 'INVENTORY_DOCUMENT_VOIDED';

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "productLocationId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "averageUnitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryDocument" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "destinationLocationId" TEXT,
    "type" "InventoryDocumentType" NOT NULL,
    "status" "InventoryDocumentStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reference" VARCHAR(100),
    "supplierName" VARCHAR(200),
    "reason" VARCHAR(500),
    "note" VARCHAR(1000),
    "createdById" TEXT,
    "createdByName" VARCHAR(300) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productLocationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" VARCHAR(150) NOT NULL,
    "productSku" VARCHAR(80),
    "productUnit" "ProductUnit" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryDocumentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productLocationId" TEXT NOT NULL,
    "documentId" TEXT,
    "documentItemId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" VARCHAR(150) NOT NULL,
    "productSku" VARCHAR(80),
    "quantityDelta" DECIMAL(14,3) NOT NULL,
    "quantityBefore" DECIMAL(14,3) NOT NULL,
    "quantityAfter" DECIMAL(14,3) NOT NULL,
    "averageUnitCostBefore" DECIMAL(12,2) NOT NULL,
    "averageUnitCostAfter" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversedMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productLocationId_key" ON "InventoryBalance"("productLocationId");
CREATE INDEX "InventoryBalance_updatedAt_idx" ON "InventoryBalance"("updatedAt");
CREATE INDEX "InventoryDocument_locationId_occurredAt_idx" ON "InventoryDocument"("locationId", "occurredAt");
CREATE INDEX "InventoryDocument_locationId_status_idx" ON "InventoryDocument"("locationId", "status");
CREATE INDEX "InventoryDocument_destinationLocationId_occurredAt_idx" ON "InventoryDocument"("destinationLocationId", "occurredAt");
CREATE INDEX "InventoryDocumentItem_productLocationId_idx" ON "InventoryDocumentItem"("productLocationId");
CREATE INDEX "InventoryDocumentItem_productId_idx" ON "InventoryDocumentItem"("productId");
CREATE UNIQUE INDEX "InventoryDocumentItem_documentId_productLocationId_key" ON "InventoryDocumentItem"("documentId", "productLocationId");
CREATE UNIQUE INDEX "InventoryMovement_reversedMovementId_key" ON "InventoryMovement"("reversedMovementId");
CREATE INDEX "InventoryMovement_productLocationId_occurredAt_idx" ON "InventoryMovement"("productLocationId", "occurredAt");
CREATE INDEX "InventoryMovement_locationId_occurredAt_idx" ON "InventoryMovement"("locationId", "occurredAt");
CREATE INDEX "InventoryMovement_documentId_idx" ON "InventoryMovement"("documentId");
CREATE UNIQUE INDEX "InventoryMovement_locationId_idempotencyKey_key" ON "InventoryMovement"("locationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productLocationId_fkey" FOREIGN KEY ("productLocationId") REFERENCES "ProductLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDocumentItem" ADD CONSTRAINT "InventoryDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryDocumentItem" ADD CONSTRAINT "InventoryDocumentItem_productLocationId_fkey" FOREIGN KEY ("productLocationId") REFERENCES "ProductLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productLocationId_fkey" FOREIGN KEY ("productLocationId") REFERENCES "ProductLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_documentItemId_fkey" FOREIGN KEY ("documentItemId") REFERENCES "InventoryDocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversedMovementId_fkey" FOREIGN KEY ("reversedMovementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
