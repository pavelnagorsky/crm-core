-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "ProductUnit" AS ENUM ('PIECE', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER');

-- ExtendEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PRODUCT';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_CATEGORY_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_CATEGORY_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_CATEGORY_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'PRODUCT_LOCATION_UPDATED';

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT,
    "imageFileId" TEXT,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000),
    "sku" VARCHAR(80),
    "barcode" VARCHAR(80),
    "unit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductLocation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "retailPrice" DECIMAL(10,2) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_brandId_name_key" ON "ProductCategory"("brandId", "name");
CREATE INDEX "ProductCategory_brandId_sortOrder_idx" ON "ProductCategory"("brandId", "sortOrder");
CREATE UNIQUE INDEX "Product_brandId_sku_key" ON "Product"("brandId", "sku");
CREATE UNIQUE INDEX "Product_brandId_barcode_key" ON "Product"("brandId", "barcode");
CREATE INDEX "Product_brandId_status_idx" ON "Product"("brandId", "status");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE UNIQUE INDEX "ProductLocation_productId_locationId_key" ON "ProductLocation"("productId", "locationId");
CREATE INDEX "ProductLocation_locationId_status_idx" ON "ProductLocation"("locationId", "status");
CREATE INDEX "ProductLocation_locationId_trackInventory_idx" ON "ProductLocation"("locationId", "trackInventory");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductLocation" ADD CONSTRAINT "ProductLocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLocation" ADD CONSTRAINT "ProductLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
