import { PriceChangeCatalog } from '@prisma/client';

/**
 * The prices of an exported file as they were exported, by the key of the price cell (lower
 * case): `BASE:<serviceId>`, `BUNDLE:<bundleId>`, `LEVEL:<serviceId>:<levelId>`,
 * `STAFF:<serviceId>:<staffId>`, `PRODUCT:<productId>`. The value is the normalized price
 * ("55.00") or null for an empty cell.
 */
export interface PriceExportSnapshot {
  catalog: PriceChangeCatalog;
  locationId: string;
  exportedAt: string;
  values: ReadonlyMap<string, string | null>;
}
