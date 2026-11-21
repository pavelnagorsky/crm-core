import { Prisma } from '@prisma/client';
import { BookingStatus } from '../../../bookings/enums/booking-status.enum.js';
import { FinanceNotSpecifiedKind } from '../../../dashboard/enums/finance-not-specified-kind.enum.js';

/** A visit or sale with something due and no active payment record. */
export interface NotSpecifiedRow {
  kind: FinanceNotSpecifiedKind;
  /** Null only for a visit without an order. */
  orderId: string | null;
  bookingId: string | null;
  /** Status of the visit; null for a sale. */
  bookingStatus: BookingStatus | null;
  /** Visit start or sale date. */
  at: Date;
  clientName: string | null;
  /** Masters of a visit, sellers of a sale. */
  staffNames: string[];
  amountDue: Prisma.Decimal;
  /** Draft (not yet sold) product lines of the order; 0 without an order. */
  draftProductsCount: number;
}
