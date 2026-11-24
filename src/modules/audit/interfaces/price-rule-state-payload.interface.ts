/** A rule was enabled, disabled, archived or restored. */
export interface PriceRuleStatePayload {
  name: string;
  /** PriceRuleKind; a promotion gets «Акция» titles. */
  kind?: string;
}
