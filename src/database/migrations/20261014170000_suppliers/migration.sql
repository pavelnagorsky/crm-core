-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(255),
    "taxId" VARCHAR(30),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "contactPerson" VARCHAR(150),
    "notes" VARCHAR(1000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryDocument" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_brandId_normalizedName_key" ON "Supplier"("brandId", "normalizedName");

-- CreateIndex
CREATE INDEX "Supplier_brandId_isActive_idx" ON "Supplier"("brandId", "isActive");

-- CreateIndex
CREATE INDEX "Supplier_brandId_updatedAt_idx" ON "Supplier"("brandId", "updatedAt");

-- CreateIndex
CREATE INDEX "InventoryDocument_supplierId_occurredAt_idx" ON "InventoryDocument"("supplierId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
