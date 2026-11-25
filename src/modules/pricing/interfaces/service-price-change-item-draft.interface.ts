import { Prisma, ServicePriceChangeTarget } from '@prisma/client';

/** One price row to store in a new change. */
export interface ServicePriceChangeItemDraft {
  targetType: ServicePriceChangeTarget;
  serviceId: string | null;
  priceLevelId: string | null;
  staffId: string | null;
  bundleId: string | null;
  targetTitle: string;
  levelName: string | null;
  staffName: string | null;
  beforePrice: Prisma.Decimal | null;
  afterPrice: Prisma.Decimal | null;
}
