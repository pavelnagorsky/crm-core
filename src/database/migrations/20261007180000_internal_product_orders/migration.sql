-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'VOIDED');
CREATE TYPE "OrderItemType" AS ENUM ('PRODUCT', 'SERVICE', 'BUNDLE', 'CUSTOM');
CREATE TYPE "OrderItemStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REVERSED');

-- ExtendEnum
ALTER TYPE "AuditEntity" ADD VALUE 'ORDER';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_ITEM_CONFIRMED';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_ITEM_REVERSED';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_VOIDED';
ALTER TYPE "AuditEvent" ADD VALUE 'ORDER_DELETED';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "orderId" TEXT,
ADD COLUMN "orderItemId" TEXT;
ALTER TABLE "StaffEarning" ADD COLUMN "orderId" TEXT,
ADD COLUMN "orderItemId" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "clientId" TEXT,
    "clientName" VARCHAR(201),
    "clientPhone" VARCHAR(30),
    "currency" VARCHAR(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "listTotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(1000),
    "createdById" TEXT,
    "createdByName" VARCHAR(300) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderItemType" NOT NULL,
    "bookingItemId" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'DRAFT',
    "catalogItemId" TEXT,
    "productLocationId" TEXT,
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
    "confirmedAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_locationId_occurredAt_idx" ON "Order"("locationId", "occurredAt");
CREATE INDEX "Order_locationId_status_idx" ON "Order"("locationId", "status");
CREATE UNIQUE INDEX "Order_bookingId_key" ON "Order"("bookingId");
CREATE INDEX "Order_clientId_occurredAt_idx" ON "Order"("clientId", "occurredAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_bookingItemId_idx" ON "OrderItem"("bookingItemId");
CREATE INDEX "OrderItem_productLocationId_idx" ON "OrderItem"("productLocationId");
CREATE INDEX "OrderItem_sellerStaffId_idx" ON "OrderItem"("sellerStaffId");
CREATE INDEX "OrderItem_type_catalogItemId_idx" ON "OrderItem"("type", "catalogItemId");
CREATE INDEX "OrderItem_status_occurredAt_idx" ON "OrderItem"("status", "occurredAt");
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");
CREATE INDEX "InventoryMovement_orderItemId_idx" ON "InventoryMovement"("orderItemId");
CREATE INDEX "StaffEarning_orderId_idx" ON "StaffEarning"("orderId");
CREATE INDEX "StaffEarning_orderItemId_idx" ON "StaffEarning"("orderItemId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productLocationId_fkey" FOREIGN KEY ("productLocationId") REFERENCES "ProductLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellerStaffId_fkey" FOREIGN KEY ("sellerStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
