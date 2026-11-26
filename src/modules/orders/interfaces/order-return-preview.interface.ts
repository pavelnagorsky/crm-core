import { Prisma } from '@prisma/client';

/** What a product return would give back (POST orders/:orderId/returns/preview). */
export interface OrderReturnPreview {
  items: {
    orderItemId: string;
    quantity: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }[];
  /** Σ lineTotal of the return. */
  totalAmount: Prisma.Decimal;
  /** Money the return would give back; 0 when no refund method is needed. */
  refundAmount: Prisma.Decimal;
}
