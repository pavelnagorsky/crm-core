CREATE TABLE "BookingWidgetInitialization" (
    "id" SERIAL NOT NULL,
    "widgetId" TEXT NOT NULL,
    "url" VARCHAR(4096),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingWidgetInitialization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingWidgetInitialization_widgetId_createdAt_id_idx"
    ON "BookingWidgetInitialization"("widgetId", "createdAt", "id");

ALTER TABLE "BookingWidgetInitialization"
    ADD CONSTRAINT "BookingWidgetInitialization_widgetId_fkey"
    FOREIGN KEY ("widgetId") REFERENCES "BookingWidget"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
