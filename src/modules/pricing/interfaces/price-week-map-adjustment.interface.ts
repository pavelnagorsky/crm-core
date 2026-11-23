/** A surcharge or rounding inside a week map segment. Minor units. */
export interface PriceWeekMapAdjustment {
  /** Null for rounding. */
  ruleId: string | null;
  title: string;
  amount: number;
}
