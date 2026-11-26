import { PriceChangeSkip, PriceChangeTarget } from '@prisma/client';

/** A stored price change row with the current category of its target, minor units. */
export interface PriceChangeItemRecord {
  id: string;
  targetType: PriceChangeTarget;
  serviceId: string | null;
  priceLevelId: string | null;
  staffId: string | null;
  bundleId: string | null;
  targetTitle: string;
  levelName: string | null;
  staffName: string | null;
  beforePrice: number | null;
  afterPrice: number | null;
  applySkip: PriceChangeSkip | null;
  rollbackSkip: PriceChangeSkip | null;
  rolledBack: boolean;
  /** Current category of the target; null: none or the target is gone. */
  categoryName: string | null;
}
