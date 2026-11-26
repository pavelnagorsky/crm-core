import { Prisma } from '@prisma/client';
import { PriceAnalyticsLayer } from './price-analytics-layer.interface.js';

/**
 * The prices of one item the report splits (docs/pricing-stage8-api.md, «Как считается одна
 * позиция»). A service: staffPrice, listPrice, customPrice ?? chargedPrice; a product line:
 * the list line total twice and lineTotal.
 */
export interface PriceAnalyticsPrices {
  /** The regular price: staffPrice, or the list line total of a product. */
  regular: Prisma.Decimal;
  /** The price-list price: listPrice, or the list line total of a product. */
  list: Prisma.Decimal;
  /** What the item cost: customPrice ?? chargedPrice, or lineTotal. */
  received: Prisma.Decimal;
  /** A custom price is set: it replaces the automatic discount. */
  custom: boolean;
  layers: readonly PriceAnalyticsLayer[];
}
