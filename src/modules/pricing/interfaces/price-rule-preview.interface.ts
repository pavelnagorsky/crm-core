import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleHolidayConflict } from './price-rule-holiday-conflict.interface.js';
import { PriceRulePreviewExample } from './price-rule-preview-example.interface.js';
import { PriceRulePreviewReplaced } from './price-rule-preview-replaced.interface.js';
import { PromotionMatches } from './promotion-matches.interface.js';
import { PromotionOverlap } from './promotion-overlap.interface.js';

/** What saving a rule input would do, without saving it. */
export interface PriceRulePreview {
  status: PriceRuleStatus;
  /** First date the rule works from today of the location; null when none is left. */
  nextDate: string | null;
  examples: PriceRulePreviewExample[];
  replaces: PriceRulePreviewReplaced[];
  conflicts: PriceRuleHolidayConflict[];
  /** Promotion conditions as clients read them; empty for surcharges. */
  conditions: string[];
  /** Distinct services the rule can touch. */
  serviceCount: number;
  /** Services of the bookable catalog. */
  totalServiceCount: number;
  /** Promotions only. */
  overlaps: PromotionOverlap[];
  /** Promotions only; null for surcharges. */
  matches30d: PromotionMatches | null;
}
