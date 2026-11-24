/** What a rule does to one service at one level at its first working time. Minor units. */
export interface PriceRulePreviewExample {
  serviceId: string;
  serviceTitle: string;
  /** Null: the location has no levels. */
  levelName: string | null;
  /** Surcharge: staff or level price. Promotion: the list price. */
  before: number;
  /** Surcharge: before plus the surcharges, not rounded. Promotion: the discounted price. */
  raw: number;
  /** Surcharge: the list price, rounded. Promotion: the discounted price. */
  after: number;
  /** Size of the change, positive: the surcharge or the discount. */
  amount: number;
}
