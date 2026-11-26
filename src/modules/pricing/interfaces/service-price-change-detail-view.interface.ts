import { PriceChangeDetailGroup } from './price-change-detail-group.interface.js';
import { PriceChangeSummaryView } from './price-change-summary-view.interface.js';

export interface ServicePriceChangeDetailView extends PriceChangeSummaryView {
  groups: PriceChangeDetailGroup[];
}
