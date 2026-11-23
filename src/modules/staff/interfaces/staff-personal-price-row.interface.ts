import { Prisma } from '@prisma/client';
import { StaffWithAvatar } from './staff-with-avatar.interface.js';

/** One personal price of an active staff member for a service. */
export interface StaffPersonalPriceRow {
  staff: StaffWithAvatar;
  serviceId: string;
  price: Prisma.Decimal;
}
