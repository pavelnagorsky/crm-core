/** A staff member a promotion is limited to. */
export interface PriceRuleStaffView {
  id: string;
  /** Current name; null when the staff member is gone. */
  name: string | null;
}
