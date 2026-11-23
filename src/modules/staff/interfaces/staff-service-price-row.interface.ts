import { Prisma } from '@prisma/client';
import { StaffWithAvatar } from './staff-with-avatar.interface.js';

/** A staff member who performs a service, with the personal price set for it. */
export interface StaffServicePriceRow {
  staff: StaffWithAvatar;
  /** Null: no personal price, the level price applies. */
  personalPrice: Prisma.Decimal | null;
}
