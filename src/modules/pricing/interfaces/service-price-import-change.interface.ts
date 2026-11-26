import { PriceChangeGroup } from './price-change-group.interface.js';
import { PriceChangeItemDraft } from './price-change-item-draft.interface.js';

/** The price changes a file makes: the preview groups and the rows to store. */
export interface ServicePriceImportChange {
  groups: PriceChangeGroup[];
  drafts: PriceChangeItemDraft[];
  serviceIds: string[];
  bundleIds: string[];
}
