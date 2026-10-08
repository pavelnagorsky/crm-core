-- CreateTable
CREATE TABLE "OrderOperation" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationType" VARCHAR(80) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderOperation_locationId_idempotencyKey_key" ON "OrderOperation"("locationId", "idempotencyKey");
CREATE INDEX "OrderOperation_orderId_createdAt_idx" ON "OrderOperation"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderOperation" ADD CONSTRAINT "OrderOperation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderOperation" ADD CONSTRAINT "OrderOperation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
