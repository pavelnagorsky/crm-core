BEGIN;

ALTER TABLE "BookingWidget" ADD COLUMN "buttonAppearance" JSONB;
UPDATE "BookingWidget" SET "buttonAppearance" = '{"text": "Записаться", "variant": "SOLID", "format": "ICON_TEXT", "size": "MEDIUM", "radius": "PILL", "icon": "CALENDAR", "color": null, "textColor": null, "shadow": true, "fullWidth": false, "mobileIconOnly": true, "offset": 24}'::jsonb;
ALTER TABLE "BookingWidget" ALTER COLUMN "buttonAppearance" SET NOT NULL;
ALTER TABLE "BookingWidget" DROP COLUMN "allowedDomains";
UPDATE "BookingWidget" SET "trigger" = 'INLINE_BUTTON' WHERE "placement" = 'INLINE';

COMMIT;
