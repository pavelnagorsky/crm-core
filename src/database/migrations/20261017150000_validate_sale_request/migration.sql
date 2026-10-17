-- Original request intent cannot be reconstructed from editable historical orders.
-- Leave their hash NULL; retrying those keys returns a conflict with the order id.
ALTER TABLE "Order" ADD COLUMN "creationRequestHash" CHAR(64);
