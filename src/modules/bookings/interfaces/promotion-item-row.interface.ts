import { Prisma } from '@prisma/client';

/** A booking item with a promotion, as the promotion report reads it. */
export interface PromotionItemRow {
  id: string;
  bookingId: string;
  staffId: string;
  staffName: string;
  serviceTitle: string;
  startAt: Date;
  listPrice: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
  /** Whole discount of the item with its rounding, listPrice - chargedPrice, positive. */
  discount: Prisma.Decimal;
  booking: {
    clientId: string | null;
    startAt: Date;
    status: string;
    clientFirstName: string;
    clientLastName: string;
    clientPhone: string | null;
    clientEmail: string | null;
    acquiredClient: { id: string } | null;
  };
}
