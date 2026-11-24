export interface PriceRuleCreatedPayload {
  name: string;
  /** PriceRuleKind; a promotion gets «Акция» titles. */
  kind?: string;
  /** Id of the rule this one was copied from. */
  copiedFrom?: string;
}
