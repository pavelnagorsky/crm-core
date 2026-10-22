ALTER TYPE "BookingPalette" ADD VALUE 'BLUSH';
ALTER TYPE "BookingPalette" ADD VALUE 'LAGOON';
ALTER TYPE "BookingPalette" ADD VALUE 'HONEY';
ALTER TYPE "BookingPalette" ADD VALUE 'COCOA';
ALTER TYPE "BookingPalette" ADD VALUE 'RUBY';
ALTER TYPE "BookingPalette" ADD VALUE 'MIST';
ALTER TYPE "BookingPalette" ADD VALUE 'OLIVE';
ALTER TYPE "BookingPalette" ADD VALUE 'INDIGO';
ALTER TYPE "BookingPalette" ADD VALUE 'APRICOT';
ALTER TYPE "BookingPalette" ADD VALUE 'PINE';

ALTER TABLE "BookingPage"
  ADD COLUMN "heading" VARCHAR(120),
  DROP COLUMN "buttonLabel",
  DROP COLUMN "showServiceImages";

ALTER TABLE "BookingWidget"
  DROP COLUMN "buttonLabel",
  DROP COLUMN "showServiceImages";
