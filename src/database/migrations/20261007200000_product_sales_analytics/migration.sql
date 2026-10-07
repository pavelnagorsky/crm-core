ALTER TABLE "OrderItem" ADD COLUMN "categoryId" TEXT;

CREATE INDEX "OrderItem_type_categoryId_idx" ON "OrderItem"("type", "categoryId");
