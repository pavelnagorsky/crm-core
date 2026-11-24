import { Prisma } from '@prisma/client';

/** A booking item with a promotion, as the promotion report reads it. */
export interface PromotionItemRow {
  id: string;
  bookingId: string;
  staffId: string;
  staffName: string;
  serviceTitle: string;
  startAt: Date;
  chargedPrice: Prisma.Decimal;
  customPrice: Prisma.Decimal | null;
  /** Discount of the promotion on the item, positive. */
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
