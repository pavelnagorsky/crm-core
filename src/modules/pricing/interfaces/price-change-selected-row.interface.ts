import { PriceChangeGroup } from './price-change-group.interface.js';
import { PriceChangeRow } from './price-change-row.interface.js';

/** A row chosen for a change, with the price it ends at (after a manual edit). */
export interface PriceChangeSelectedRow {
  group: PriceChangeGroup;
  row: PriceChangeRow;
  after: number | null;
}
