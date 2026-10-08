import { Prisma } from '@prisma/client';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';

export interface BookingPricingResult {
  currency: string;
  bundleId: string | null;
  bundleTitle: string | null;
  serviceTotal: Prisma.Decimal;
  productTotal: Prisma.Decimal;
  listTotalAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  items: OrderPricingLine[];
}
