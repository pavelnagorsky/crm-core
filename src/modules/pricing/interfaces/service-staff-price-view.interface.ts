import { File, Prisma, StaffStatus } from '@prisma/client';

export interface ServiceStaffPriceView {
  staffId: string;
  name: string;
  avatarFile: File | null;
  status: StaffStatus;
  /** Null: the default level. */
  levelId: string | null;
  /** Null: the default level and the location has no levels. */
  levelName: string | null;
  levelPrice: Prisma.Decimal;
  personalPrice: Prisma.Decimal | null;
  price: Prisma.Decimal;
}
