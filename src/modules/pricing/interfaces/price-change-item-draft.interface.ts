import { Prisma, PriceChangeTarget } from '@prisma/client';

/** One price row to store in a new change. */
export interface PriceChangeItemDraft {
  targetType: PriceChangeTarget;
  serviceId: string | null;
  priceLevelId: string | null;
  staffId: string | null;
  bundleId: string | null;
  productLocationId: string | null;
  targetTitle: string;
  levelName: string | null;
  staffName: string | null;
  beforePrice: Prisma.Decimal | null;
  afterPrice: Prisma.Decimal | null;
}
