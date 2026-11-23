/** Another exclusive holiday rule on a date of the rule being saved. */
export interface PriceRuleHolidayConflict {
  ruleId: string;
  ruleName: string;
  /** YYYY-MM-DD of the saved rule. */
  date: string;
}
