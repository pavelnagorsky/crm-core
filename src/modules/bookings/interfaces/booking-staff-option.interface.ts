import { Prisma } from '@prisma/client';

export interface BookingStaffOption {
  id: string;
  name: string;
  /** What this staff member would charge for what the selection asks them to take. */
  price: Prisma.Decimal;
}
