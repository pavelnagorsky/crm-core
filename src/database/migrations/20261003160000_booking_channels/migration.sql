-- CreateEnum
CREATE TYPE "BookingChannelStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BookingPalette" AS ENUM ('INK', 'SAND', 'SAGE', 'DUSK', 'WINE', 'PEARL', 'GRAPHITE', 'EMERALD', 'SKY', 'LAVENDER', 'CORAL', 'MONO', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookingWidgetPlacement" AS ENUM ('INLINE', 'SIDEBAR', 'DIALOG');

-- CreateEnum
CREATE TYPE "BookingWidgetTrigger" AS ENUM ('INLINE_BUTTON', 'FLOATING_BUTTON');

-- CreateEnum
CREATE TYPE "BookingWidgetButtonPosition" AS ENUM ('BOTTOM_RIGHT', 'BOTTOM_LEFT');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "bookingPageId" TEXT,
ADD COLUMN "bookingWidgetId" TEXT;

-- CreateTable
CREATE TABLE "BookingPage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(48) NOT NULL,
    "status" "BookingChannelStatus" NOT NULL DEFAULT 'DRAFT',
    "tagline" VARCHAR(120) NOT NULL DEFAULT '',
    "html" VARCHAR(20000) NOT NULL DEFAULT '',
    "metaTitle" VARCHAR(70) NOT NULL DEFAULT '',
    "metaDescription" VARCHAR(160) NOT NULL DEFAULT '',
    "coverFileId" TEXT,
    "palette" "BookingPalette" NOT NULL,
    "customBackground" VARCHAR(7),
    "customSurface" VARCHAR(7),
    "customText" VARCHAR(7),
    "customMuted" VARCHAR(7),
    "customAccent" VARCHAR(7),
    "customAccentText" VARCHAR(7),
    "headline" VARCHAR(80) NOT NULL,
    "caption" VARCHAR(120) NOT NULL DEFAULT '',
    "buttonLabel" VARCHAR(32) NOT NULL,
    "showStaff" BOOLEAN NOT NULL,
    "showServiceImages" BOOLEAN NOT NULL,
    "showBranding" BOOLEAN NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingWidget" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "titleKey" VARCHAR(80) NOT NULL,
    "status" "BookingChannelStatus" NOT NULL DEFAULT 'DRAFT',
    "placement" "BookingWidgetPlacement" NOT NULL,
    "trigger" "BookingWidgetTrigger" NOT NULL,
    "buttonPosition" "BookingWidgetButtonPosition" NOT NULL,
    "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "palette" "BookingPalette" NOT NULL,
    "customBackground" VARCHAR(7),
    "customSurface" VARCHAR(7),
    "customText" VARCHAR(7),
    "customMuted" VARCHAR(7),
    "customAccent" VARCHAR(7),
    "customAccentText" VARCHAR(7),
    "headline" VARCHAR(80) NOT NULL,
    "caption" VARCHAR(120) NOT NULL DEFAULT '',
    "buttonLabel" VARCHAR(32) NOT NULL,
    "showStaff" BOOLEAN NOT NULL,
    "showServiceImages" BOOLEAN NOT NULL,
    "showBranding" BOOLEAN NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingPage_slug_key" ON "BookingPage"("slug");

-- CreateIndex
CREATE INDEX "BookingPage_businessId_updatedAt_idx" ON "BookingPage"("businessId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingWidget_businessId_titleKey_key" ON "BookingWidget"("businessId", "titleKey");

-- CreateIndex
CREATE INDEX "BookingWidget_businessId_updatedAt_idx" ON "BookingWidget"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "Booking_bookingPageId_idx" ON "Booking"("bookingPageId");

-- CreateIndex
CREATE INDEX "Booking_bookingWidgetId_idx" ON "Booking"("bookingWidgetId");

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingWidget" ADD CONSTRAINT "BookingWidget_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingPageId_fkey" FOREIGN KEY ("bookingPageId") REFERENCES "BookingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingWidgetId_fkey" FOREIGN KEY ("bookingWidgetId") REFERENCES "BookingWidget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
