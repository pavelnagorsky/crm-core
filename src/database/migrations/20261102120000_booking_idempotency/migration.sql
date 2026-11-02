ALTER TABLE "Booking"
ADD COLUMN "idempotencyKey" VARCHAR(36),
ADD COLUMN "creationRequestHash" CHAR(64);

CREATE UNIQUE INDEX "Booking_locationId_idempotencyKey_key"
ON "Booking"("locationId", "idempotencyKey");
