import { Prisma } from '@prisma/client';

/** What an order operation on a visit order needs to know about the visit. */
export interface VisitPaymentFacts {
  /** The booking was deleted: money may leave its order but not come back. */
  deleted: boolean;
  /** Services due by the booking (visit payment rules). */
  servicesDue: Prisma.Decimal;
  /** Masters of the visit services. */
  staffIds: string[];
}
