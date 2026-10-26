BEGIN;

CREATE TYPE "BookingSource_new" AS ENUM ('PUBLIC_PAGE', 'WIDGET', 'MANUAL');

ALTER TABLE "Booking"
  ALTER COLUMN "source" TYPE "BookingSource_new"
  USING (
    CASE "source"::text
      WHEN 'WALK_IN' THEN 'MANUAL'
      ELSE "source"::text
    END
  )::"BookingSource_new";

ALTER TYPE "BookingSource" RENAME TO "BookingSource_old";
ALTER TYPE "BookingSource_new" RENAME TO "BookingSource";
DROP TYPE "BookingSource_old";

COMMIT;
