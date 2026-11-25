import { ServicePriceChangeSkip } from '@prisma/client';

/** The result of applying or rolling back one row, to store on it. */
export interface PriceChangeItemMark {
  itemId: string;
  /** Apply: the stored price before the write. Unused on rollback. */
  before: number | null;
  skip: ServicePriceChangeSkip | null;
  /** Rollback: the price came back. */
  rolledBack: boolean;
}
