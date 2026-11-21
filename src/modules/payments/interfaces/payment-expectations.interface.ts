import { Prisma } from '@prisma/client';

/** What the person saw when paying in one click; a payment that disagrees is not written. */
export interface PaymentExpectations {
  /** The amount shown; null when not checked. */
  expectedAmount: Prisma.Decimal | null;
  /** The order was shown without a payment. */
  expectNoPayment: boolean;
}
