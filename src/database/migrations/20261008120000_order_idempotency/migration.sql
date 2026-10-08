ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Order_locationId_idempotencyKey_key" ON "Order"("locationId", "idempotencyKey");
