import { Prisma } from '@prisma/client';
import { ServicePriceAdjustment } from './service-price-adjustment.interface.js';

/**
 * Price layers of one service line (docs/pricing-plan.md 2.1):
 * basePrice -> staffPrice -> listPrice -> chargedPrice = listPrice - discountTotal.
 * What the client pays is customPrice ?? chargedPrice.
 */
export interface ServiceLinePrice {
  serviceId: string;
  basePrice: Prisma.Decimal;
  staffPrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
  customPrice: Prisma.Decimal | null;
  adjustments: ServicePriceAdjustment[];
}
