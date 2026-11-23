/** What a rule does to one service at one level at its first working time. Minor units. */
export interface PriceRulePreviewExample {
  serviceId: string;
  serviceTitle: string;
  /** Null: the location has no levels. */
  levelName: string | null;
  /** Staff or level price before the surcharges. */
  before: number;
  /** Before plus the surcharges, not rounded. */
  raw: number;
  /** The list price: rounded to the location step. */
  after: number;
}
