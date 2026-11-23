/** A service at a level the rule preview prices. */
export interface PriceRulePreviewExampleRow {
  serviceId: string;
  serviceTitle: string;
  /** Null: the base level, priced as a staff member without a level. */
  levelId: string | null;
  levelName: string | null;
}
