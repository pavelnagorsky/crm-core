import { Prisma } from '@prisma/client';
import { OrderPaymentTotals } from '../../payments/interfaces/order-payment-totals.interface.js';

/** Payment of a visit: what is due by the booking and its order, and the active journal. */
export interface VisitPaymentSummary {
  bookingId: string;
  orderId: string | null;
  servicesAmount: Prisma.Decimal;
  productsAmount: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  totals: OrderPaymentTotals | null;
  /** The visit is in payment tracking of its location (by its start). */
  tracked: boolean;
  /** Draft product lines of the visit order; 0 without an order. */
  draftProductsCount: number;
}
