import { Prisma } from '@prisma/client';
import { PromotionMatchItemsLoader } from './promotion-match-items-loader.interface.js';
import { PromotionSaleLine } from './promotion-sale-line.interface.js';

/**
 * What a promotion preview reads outside the price rules: past bookings and sales for
 * matches30d, purchase costs for "below cost". Missing loaders give empty results.
 */
export interface PriceRulePreviewSources {
  loadMatchItems?: PromotionMatchItemsLoader;
  /** Confirmed product lines of separate sales with confirmedAt in [from, to]. */
  loadSaleLines?: (from: Date, to: Date) => Promise<PromotionSaleLine[]>;
  /** Last purchase unit cost by productLocationId; products never received are absent. */
  loadPurchaseCosts?: (
    productLocationIds: readonly string[],
  ) => Promise<Map<string, Prisma.Decimal>>;
  /** Read(INVENTORY): the cost is returned as a number; belowCost is computed either way. */
  canReadPurchaseCost?: boolean;
}
