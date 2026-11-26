/**
 * Payload of the product price change events. Always `title`; the rest depends on the event:
 * CREATED - effectiveDate, productsCount; PRODUCT_PRICES_IMPORTED - fileName, effectiveDate
 * (null: now), itemsCount; APPLIED - appliedCount, applySkippedCount; CANCELLED -
 * effectiveDate; ROLLED_BACK - restoredCount, rollbackSkippedCount.
 */
export interface ProductPriceChangeAuditPayload {
  title: string;
  fileName?: string;
  /** YYYY-MM-DD */
  effectiveDate?: string | null;
  productsCount?: number;
  itemsCount?: number;
  appliedCount?: number;
  applySkippedCount?: number;
  restoredCount?: number;
  rollbackSkippedCount?: number;
}
