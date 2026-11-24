import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';
import { PromoCodeStatus } from '../enums/promo-code-status.enum.js';

/** What the promo code of a visit did. */
export interface PromoCodeResult {
  /** Upper case. */
  code: string;
  status: PromoCodeStatus;
  /** Promotion with this code; null when NOT_FOUND. */
  ruleId: string | null;
  /** NOT_APPLICABLE only. */
  reason: PriceRuleSkipReason | null;
}
