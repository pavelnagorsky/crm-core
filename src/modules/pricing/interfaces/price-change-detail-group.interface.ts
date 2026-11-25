import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeItemRow } from './price-change-item-row.interface.js';

/** The stored rows of one service or bundle of a change. */
export interface PriceChangeDetailGroup {
  kind: ServicePriceChangeGroupKind;
  /** Null: the target was deleted. */
  id: string | null;
  title: string;
  categoryName: string | null;
  rows: PriceChangeItemRow[];
}
