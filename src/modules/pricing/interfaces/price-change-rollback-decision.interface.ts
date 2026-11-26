import { PriceChangeSkip } from '@prisma/client';

/** What a rollback does with one row. */
export type PriceChangeRollbackDecision =
  | { kind: 'IGNORE' }
  | { kind: 'RESTORE'; price: number | null }
  | { kind: 'SKIP'; skip: PriceChangeSkip };
