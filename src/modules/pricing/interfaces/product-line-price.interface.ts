import { Prisma } from '@prisma/client';
import { PromotionSkip } from '../engine/interfaces/promotion-skip.interface.js';
import { ServiceDiscountOption } from './service-discount-option.interface.js';
import { ServicePriceAdjustment } from './service-price-adjustment.interface.js';

/**
 * Money of one product line, ready to store in OrderItem (docs/pricing-stage7-api.md):
 * unitPrice = customUnitPrice ?? listUnitPrice; lineTotal = lineSubtotal - discountTotal.
 */
export interface ProductLinePrice {
  productLocationId: string;
  productId: string;
  baseUnitPrice: Prisma.Decimal;
  listUnitPrice: Prisma.Decimal;
  listLineTotal: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  /** Zero or one layer (PROMOTION or CLIENT_DISCOUNT), amount on the line. */
  adjustments: ServicePriceAdjustment[];
  discount: ServicePriceAdjustment | null;
  /** chargedPrice: the line total with that discount. */
  eligible: ServiceDiscountOption[];
  ineligible: PromotionSkip[];
}
