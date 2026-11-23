export interface PriceRuleCreatedPayload {
  name: string;
  /** Id of the rule this one was copied from. */
  copiedFrom?: string;
}
