import { ServicePriceChangeSkip, ServicePriceChangeTarget } from '@prisma/client';

/** One stored row of a change as the history shows it, minor units. */
export interface PriceChangeItemRow {
  itemId: string;
  targetType: ServicePriceChangeTarget;
  levelId: string | null;
  levelName: string | null;
  staffId: string | null;
  staffName: string | null;
  before: number | null;
  after: number | null;
  /** Stored price now; only in a rollback answer. */
  current?: number | null;
  applySkip: ServicePriceChangeSkip | null;
  rollbackSkip: ServicePriceChangeSkip | null;
  rolledBack: boolean;
}
