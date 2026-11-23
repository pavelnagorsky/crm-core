import { Prisma } from '@prisma/client';

export interface BookingStaffOption {
  id: string;
  name: string;
  /**
   * What this staff member would charge for what the selection asks them to take: exact at
   * the requested start, else the lowest price over the online booking window.
   */
  price: Prisma.Decimal;
  /** Highest price over the online booking window; equals price at a requested start. */
  priceTo: Prisma.Decimal;
}
