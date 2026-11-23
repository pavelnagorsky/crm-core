import { Prisma } from '@prisma/client';

/** A personal price of a staff member next to the price their level would give. */
export interface PersonalPrice {
  staffId: string;
  staffName: string;
  avatarUrl: string | null;
  /** Level of the staff member; the default level name when they have none. */
  levelName: string | null;
  serviceId: string;
  serviceTitle: string;
  /** Level price, else the base price. */
  levelPrice: Prisma.Decimal;
  price: Prisma.Decimal;
}
