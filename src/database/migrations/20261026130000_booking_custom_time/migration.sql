BEGIN;

ALTER TABLE "Booking" ADD COLUMN "isCustomTime" BOOLEAN NOT NULL DEFAULT false;

-- Recover custom time bookings identified by the legacy source in creation
-- audit entries, before it was merged into the manual channel.
UPDATE "Booking" AS booking
SET "isCustomTime" = true
WHERE booking."source" = 'MANUAL'
  AND EXISTS (
    SELECT 1 FROM "AuditLog" AS audit
    WHERE audit."entityType" = 'BOOKING'
      AND audit."eventType" = 'BOOKING_CREATED'
      AND audit."entityId" = booking."id"
      AND audit."locationId" = booking."locationId"
      AND audit."payload"->>'source' = 'WALK_IN'
  );

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_custom_time_manual_source_check"
  CHECK (NOT "isCustomTime" OR "source" = 'MANUAL');

COMMIT;
