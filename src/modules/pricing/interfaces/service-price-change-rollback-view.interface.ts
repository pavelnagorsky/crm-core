import { PriceChangeItemRow } from './price-change-item-row.interface.js';
import { ServicePriceChangeDetailView } from './service-price-change-detail-view.interface.js';

export interface ServicePriceChangeRollbackView {
  detail: ServicePriceChangeDetailView;
  restoredCount: number;
  skipped: PriceChangeItemRow[];
}
