ALTER TABLE "BookingPage"
DROP COLUMN "gtmId",
ADD COLUMN "googleAnalyticsId" VARCHAR(32);

ALTER TABLE "BookingWidget"
DROP COLUMN "gtmId",
ADD COLUMN "googleAnalyticsId" VARCHAR(32);
