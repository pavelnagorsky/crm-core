import { PromotionItemRow } from './promotion-item-row.interface.js';

/** A client after a completed visit with the promotion, at least 14 days ago. */
export interface PromotionReturnCandidate {
  clientId: string;
  /** Start of the last such visit. */
  lastVisit: Date;
  items: PromotionItemRow[];
}
