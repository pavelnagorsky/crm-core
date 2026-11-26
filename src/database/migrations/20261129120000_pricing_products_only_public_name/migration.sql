-- A products-only promotion is never shown to clients (docs/pricing-stage7-api.md, «Акция только на товары»):
-- its public name is optional and showAsPromotion is false. The service decides what is products-only; the
-- check keeps the name required whenever the promotion is shown as a promotion.
ALTER TABLE "PriceRule" DROP CONSTRAINT "PriceRule_promotion_fields_check";

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_promotion_fields_check" CHECK (
  "kind"::text <> 'PROMOTION' OR (
    ("valueType" <> 'PERCENT' OR "value" <= 100)
    AND COALESCE(cardinality("channels"), 0) > 0
    AND ("publicName" IS NULL OR length(btrim("publicName")) > 0)
    AND ("showAsPromotion" = false OR "publicName" IS NOT NULL)
    AND "scheduleType" = 'WEEKLY' AND "yearly" = false AND "holidayExclusive" = false
  )
);
