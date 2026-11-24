/** Which discount a line gets (docs/pricing-stage4-api.md, booking dialog). */
export enum DiscountChoiceMode {
  /** The best one. */
  AUTO = 'AUTO',
  /** No discount. */
  NONE = 'NONE',
  /** This promotion (ruleId), if it applies to the line. */
  RULE = 'RULE',
  /** The personal discount of the client, if there is one. */
  CLIENT_DISCOUNT = 'CLIENT_DISCOUNT',
}
