import { Prisma } from '@prisma/client';

/** The visit order of a booking and the products sold in it. */
export interface BookingOrderProducts {
  orderId: string;
  /** Confirmed product lines minus their posted returns. */
  productsNet: Prisma.Decimal;
  /** Draft (not yet sold) product lines. */
  draftProductsCount: number;
}
