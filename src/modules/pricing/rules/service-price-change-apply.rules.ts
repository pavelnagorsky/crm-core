import { ServicePriceChangeSkip } from '@prisma/client';
import { PriceChangeRollbackDecision } from '../interfaces/price-change-rollback-decision.interface.js';
import { PriceChangeTargetState } from '../interfaces/price-change-target-state.interface.js';

/**
 * What applying a row does: a row whose target cannot take the price is skipped with the
 * reason; otherwise the price is written and "before" becomes the stored value.
 */
export function applyDecision(state: PriceChangeTargetState): {
  write: boolean;
  skip: ServicePriceChangeSkip | null;
} {
  return state.skip ? { write: false, skip: state.skip } : { write: true, skip: null };
}

/**
 * What a rollback does with a row: rows that were never applied are left alone; a row whose
 * target is gone or cannot hold the price is skipped with that reason; a row whose stored
 * price still equals "after" gets "before" back (null removes the price); otherwise the
 * price changed later and stays, CHANGED_AFTER.
 */
export function rollbackDecision(
  item: {
    applySkip: ServicePriceChangeSkip | null;
    beforePrice: number | null;
    afterPrice: number | null;
  },
  state: PriceChangeTargetState,
): PriceChangeRollbackDecision {
  if (item.applySkip !== null) return { kind: 'IGNORE' };
  if (state.skip !== null) return { kind: 'SKIP', skip: state.skip };
  if (state.current === item.afterPrice)
    return { kind: 'RESTORE', price: item.beforePrice };
  return { kind: 'SKIP', skip: ServicePriceChangeSkip.CHANGED_AFTER };
}
