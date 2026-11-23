/** Visit start interval in minutes of the local day: start <= minute < end, end <= 1440. */
export interface PricingRuleIntervalEntry {
  start: number;
  end: number;
}
