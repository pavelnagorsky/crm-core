CREATE TYPE "OrderReturnStatus" AS ENUM ('POSTED', 'VOIDED');

CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderReturnStatus" NOT NULL DEFAULT 'POSTED',
    "reason" VARCHAR(500) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdById" TEXT,
    "createdByName" VARCHAR(300) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productLocationId" TEXT,
    "productId" TEXT,
    "categoryId" TEXT,
    "title" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(80),
    "unit" "ProductUnit",
    "quantity" DECIMAL(14,3) NOT NULL,
    "listUnitPrice" DECIMAL(10,2) NOT NULL,
    "customUnitPrice" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineSubtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "unitCostSnapshot" DECIMAL(12,2),
    "lineCostSnapshot" DECIMAL(14,2),
    "sellerStaffId" TEXT,
    "sellerName" VARCHAR(250),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement" ADD COLUMN "orderReturnItemId" TEXT;
ALTER TABLE "StaffEarning" ADD COLUMN "orderReturnItemId" TEXT;

CREATE UNIQUE INDEX "OrderReturn_locationId_idempotencyKey_key" ON "OrderReturn"("locationId", "idempotencyKey");
CREATE INDEX "OrderReturn_orderId_occurredAt_idx" ON "OrderReturn"("orderId", "occurredAt");
CREATE INDEX "OrderReturn_locationId_occurredAt_idx" ON "OrderReturn"("locationId", "occurredAt");
CREATE INDEX "OrderReturn_locationId_status_idx" ON "OrderReturn"("locationId", "status");
CREATE INDEX "OrderReturnItem_returnId_idx" ON "OrderReturnItem"("returnId");
CREATE INDEX "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");
CREATE INDEX "OrderReturnItem_productLocationId_idx" ON "OrderReturnItem"("productLocationId");
CREATE INDEX "OrderReturnItem_sellerStaffId_idx" ON "OrderReturnItem"("sellerStaffId");
CREATE UNIQUE INDEX "OrderReturnItem_returnId_orderItemId_key" ON "OrderReturnItem"("returnId", "orderItemId");
CREATE INDEX "InventoryMovement_orderReturnItemId_idx" ON "InventoryMovement"("orderReturnItemId");
CREATE INDEX "StaffEarning_orderReturnItemId_idx" ON "StaffEarning"("orderReturnItemId");

ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderReturnItemId_fkey" FOREIGN KEY ("orderReturnItemId") REFERENCES "OrderReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_orderReturnItemId_fkey" FOREIGN KEY ("orderReturnItemId") REFERENCES "OrderReturnItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
