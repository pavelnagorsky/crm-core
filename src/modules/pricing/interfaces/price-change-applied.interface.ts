import { PriceChangeCatalog } from '@prisma/client';

/** A change the applier moved into the prices, for the after-commit work. */
export interface PriceChangeApplied {
  changeId: string;
  locationId: string;
  catalog: PriceChangeCatalog;
  title: string;
  appliedCount: number;
  applySkippedCount: number;
}
