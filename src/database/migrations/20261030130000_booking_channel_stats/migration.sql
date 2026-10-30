ALTER TABLE "BookingWidget"
ADD COLUMN "gtmId" VARCHAR(32),
ADD COLUMN "yandexMetrikaId" VARCHAR(15);

CREATE TABLE "BookingPageStats" (
    "pageId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "formOpens" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BookingPageStats_pkey" PRIMARY KEY ("pageId"),
    CONSTRAINT "BookingPageStats_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BookingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BookingWidgetStats" (
    "widgetId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "formOpens" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BookingWidgetStats_pkey" PRIMARY KEY ("widgetId"),
    CONSTRAINT "BookingWidgetStats_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "BookingWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
