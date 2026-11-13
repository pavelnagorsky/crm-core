-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reminderDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_reminderDueAt_idx" ON "Booking"("reminderDueAt");


-- Backfill upcoming confirmed bookings that were not reminded yet. The moment they were confirmed
-- is unknown, so the lead is counted from now. Timestamps are stored in UTC.
UPDATE "Booking"
SET "reminderDueAt" = CASE
    WHEN "startAt" - (now() AT TIME ZONE 'UTC') > INTERVAL '24 hours' THEN "startAt" - INTERVAL '24 hours'
    WHEN "startAt" - (now() AT TIME ZONE 'UTC') > INTERVAL '6 hours' THEN "startAt" - INTERVAL '2 hours'
    ELSE NULL
  END
WHERE "status" = 'CONFIRMED'
  AND "reminderSentAt" IS NULL
  AND "deletedAt" IS NULL
  AND "startAt" > (now() AT TIME ZONE 'UTC');
