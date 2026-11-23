import { Prisma } from '@prisma/client';

export interface ServiceLevelPriceView {
  levelId: string;
  name: string;
  isDefault: boolean;
  /** Own price of the level; null: as the base price (always null for the default level). */
  price: Prisma.Decimal | null;
  staffCount: number;
}
