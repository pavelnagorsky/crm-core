import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleHolidayConflict } from './price-rule-holiday-conflict.interface.js';
import { PriceRulePreviewExample } from './price-rule-preview-example.interface.js';
import { PriceRulePreviewReplaced } from './price-rule-preview-replaced.interface.js';

/** What saving a rule input would do, without saving it. */
export interface PriceRulePreview {
  status: PriceRuleStatus;
  /** First date the rule works from today of the location; null when none is left. */
  nextDate: string | null;
  examples: PriceRulePreviewExample[];
  replaces: PriceRulePreviewReplaced[];
  conflicts: PriceRuleHolidayConflict[];
}
