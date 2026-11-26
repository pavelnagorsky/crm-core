import { PriceRuleSkipReason } from '../engine/enums/price-rule-skip-reason.enum.js';

/** Payload of PROMOTION_NOT_APPLICABLE: the line whose chosen discount does not apply. */
export interface PromotionNotApplicable {
  lineIndex: number;
  ruleId: string | null;
  reason: PriceRuleSkipReason;
  /** A product line: its brand product. */
  productId?: string;
}
