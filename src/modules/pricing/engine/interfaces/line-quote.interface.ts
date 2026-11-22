import { PriceAdjustment } from './price-adjustment.interface.js';

/**
 * Price layers of one line (docs/pricing-plan.md 2.1), in integer minor units:
 * basePrice -> staffPrice -> listPrice -> chargedPrice = listPrice - discountTotal;
 * total = customPrice ?? chargedPrice.
 */
export interface LineQuote {
  serviceId: string;
  basePrice: number;
  staffPrice: number;
  listPrice: number;
  discountTotal: number;
  chargedPrice: number;
  customPrice: number | null;
  total: number;
  adjustments: PriceAdjustment[];
}
