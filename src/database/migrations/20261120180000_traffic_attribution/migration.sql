-- Technical booking channel: rename BookingSource -> BookingChannel and Booking.source -> channel, keeping data.
ALTER TYPE "BookingSource" RENAME TO "BookingChannel";
ALTER TABLE "Booking" RENAME COLUMN "source" TO "channel";

-- CreateEnum
CREATE TYPE "TrafficSource" AS ENUM ('DIRECT', 'INSTAGRAM', 'VK', 'TELEGRAM', 'WHATSAPP', 'TIKTOK', 'FACEBOOK', 'YANDEX_MAPS', 'TWO_GIS', 'GOOGLE_MAPS', 'SEARCH', 'PAID_ADS', 'WEBSITE', 'MAILING', 'OFFLINE', 'REFERRAL', 'PHONE_CALL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "ClickIdType" AS ENUM ('GCLID', 'GBRAID', 'WBRAID', 'YCLID', 'YSCLID', 'FBCLID', 'TTCLID', 'MSCLKID');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "trafficSource" "TrafficSource",
ADD COLUMN "trafficSourceDetail" VARCHAR(64);

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "acquiredAt" TIMESTAMP(3),
ADD COLUMN "acquisitionBookingId" TEXT,
ADD COLUMN "acquisitionSource" "TrafficSource",
ADD COLUMN "acquisitionSourceDetail" VARCHAR(64),
ADD COLUMN "importedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingTrafficTouch" (
    "bookingId" TEXT NOT NULL,
    "utmSource" VARCHAR(100),
    "utmMedium" VARCHAR(100),
    "utmCampaign" VARCHAR(150),
    "utmContent" VARCHAR(150),
    "utmTerm" VARCHAR(150),
    "referrerHost" VARCHAR(253),
    "clickIdType" "ClickIdType",
    "clickId" VARCHAR(255),
    "touchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTrafficTouch_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "BookingTrafficStat" (
    "locationId" TEXT NOT NULL,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "channel" "BookingChannel" NOT NULL,
    "channelId" TEXT NOT NULL,
    "source" "TrafficSource" NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "formOpens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingTrafficStat_pkey" PRIMARY KEY ("locationId","hourStart","channelId","source")
);

-- CreateIndex
CREATE INDEX "BookingTrafficTouch_createdAt_idx" ON "BookingTrafficTouch"("createdAt");

-- CreateIndex
CREATE INDEX "BookingTrafficStat_hourStart_idx" ON "BookingTrafficStat"("hourStart");

-- CreateIndex
CREATE INDEX "Booking_locationId_deletedAt_createdAt_idx" ON "Booking"("locationId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_acquisitionBookingId_key" ON "Client"("acquisitionBookingId");

-- CreateIndex
CREATE INDEX "Client_brandId_acquiredAt_idx" ON "Client"("brandId", "acquiredAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_acquisitionBookingId_fkey" FOREIGN KEY ("acquisitionBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrafficTouch" ADD CONSTRAINT "BookingTrafficTouch_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTrafficStat" ADD CONSTRAINT "BookingTrafficStat_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (dev data only, no production yet): online bookings made before tracking count as direct.
UPDATE "Booking" SET "trafficSource" = 'DIRECT' WHERE "channel" <> 'MANUAL';

-- Backfill: a client's first live booking in the brand is their acquisition booking.
UPDATE "Client" c
SET "acquisitionBookingId" = first_booking."id",
    "acquiredAt" = first_booking."createdAt",
    "acquisitionSource" = first_booking."trafficSource",
    "acquisitionSourceDetail" = first_booking."trafficSourceDetail"
FROM (
  SELECT DISTINCT ON (b."clientId") b."clientId", b."id", b."createdAt", b."trafficSource", b."trafficSourceDetail"
  FROM "Booking" b
  WHERE b."clientId" IS NOT NULL AND b."deletedAt" IS NULL
  ORDER BY b."clientId", b."createdAt" ASC, b."id" ASC
) first_booking
WHERE first_booking."clientId" = c."id";
