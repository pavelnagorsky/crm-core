import { Prisma } from '@prisma/client';
import { STAFF_BOOKING_SELECT } from '../cache/staff-booking-directory.cache.js';

export type BookingStaff = Prisma.StaffGetPayload<{
  select: typeof STAFF_BOOKING_SELECT;
}>;
