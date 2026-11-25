import { Prisma } from '@prisma/client';
import { ServicePriceAdjustment } from '../../pricing/interfaces/service-price-adjustment.interface.js';
import { BookingItemDiscountChoice } from './booking-item-discount-choice.interface.js';

/** With the discount the administrator picked for the line (null = AUTO, online always). */
export interface ResolvedBookingItem extends BookingItemDiscountChoice {
  serviceId: string;
  staffId: string;
  sortOrder: number;
  startAt: Date;
  endAt: Date;
  serviceTitle: string;
  serviceDuration: number;
  /** Price layers from PricingFacade, see BookingItem in schema.prisma. */
  basePrice: Prisma.Decimal;
  staffPrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
  customPrice: Prisma.Decimal | null;
  priceAdjustments: ServicePriceAdjustment[];
  staffName: string;
}
