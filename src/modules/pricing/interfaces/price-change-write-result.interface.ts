import { PriceChangeApplied } from './price-change-applied.interface.js';

export interface PriceChangeWriteResult {
  changeId: string;
  /** True when the change was applied at once (no date). */
  applied: boolean;
  /** Earlier changes whose date had come, applied in the same transaction. */
  dueApplied?: PriceChangeApplied[];
}
