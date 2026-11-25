import { ServicePriceChangeApplied } from './service-price-change-applied.interface.js';

export interface ServicePriceChangeWriteResult {
  changeId: string;
  /** True when the change was applied at once (no date). */
  applied: boolean;
  /** Earlier changes whose date had come, applied in the same transaction. */
  dueApplied?: ServicePriceChangeApplied[];
}
