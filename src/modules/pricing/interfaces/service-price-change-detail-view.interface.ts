import { PriceChangeDetailGroup } from './price-change-detail-group.interface.js';
import { ServicePriceChangeSummaryView } from './service-price-change-summary-view.interface.js';

export interface ServicePriceChangeDetailView extends ServicePriceChangeSummaryView {
  groups: PriceChangeDetailGroup[];
}
