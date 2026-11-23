import { Prisma } from '@prisma/client';

/** What a staff member charges for one of their services. */
export interface BookingStaffServicePrice {
  serviceId: string;
  price: Prisma.Decimal;
}
