/**
 * Payload of the service price change events. Always `title`; the rest depends on the event:
 * CREATED - effectiveDate, servicesCount, bundlesCount; SERVICE_PRICES_IMPORTED - fileName,
 * effectiveDate (null: now), itemsCount, createdServicesCount; APPLIED - appliedCount,
 * applySkippedCount; CANCELLED - effectiveDate; ROLLED_BACK - restoredCount,
 * rollbackSkippedCount.
 */
export interface ServicePriceChangeAuditPayload {
  title: string;
  fileName?: string;
  /** YYYY-MM-DD */
  effectiveDate?: string | null;
  servicesCount?: number;
  bundlesCount?: number;
  itemsCount?: number;
  createdServicesCount?: number;
  appliedCount?: number;
  applySkippedCount?: number;
  restoredCount?: number;
  rollbackSkippedCount?: number;
}
