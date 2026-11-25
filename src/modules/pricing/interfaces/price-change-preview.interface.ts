import { PriceChangeConflict } from './price-change-conflict.interface.js';
import { PriceChangeCounts } from './price-change-counts.interface.js';
import { PriceChangeGroup } from './price-change-group.interface.js';

export interface PriceChangePreview {
  /** YYYY-MM-DD: the effective date, or the location today. */
  date: string;
  groups: PriceChangeGroup[];
  counts: PriceChangeCounts;
  affectedBookingsCount: number;
  conflicts: PriceChangeConflict[];
}
