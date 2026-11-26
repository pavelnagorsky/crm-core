import { PromotionProductStats } from './promotion-product-stats.interface.js';

/** Product side of the list stats of a promotion (docs/pricing-stage7-api.md, stats30d). */
export interface PromotionSalesStats extends PromotionProductStats {
  /** Uses of all time: live visits and separate sales with the promotion, each once. */
  usageCount: number;
}
