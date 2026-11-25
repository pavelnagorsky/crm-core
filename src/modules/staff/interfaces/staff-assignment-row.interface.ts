import { Prisma } from '@prisma/client';

/** A service an active staff member performs, with their personal price for it (null: none). */
export interface StaffAssignmentRow {
  staffId: string;
  staffName: string;
  serviceId: string;
  price: Prisma.Decimal | null;
}
