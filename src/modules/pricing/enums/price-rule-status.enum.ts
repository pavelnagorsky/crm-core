/** Where a surcharge rule stands today, by the location calendar. */
export enum PriceRuleStatus {
  /** In force today: its period includes today (a holiday rule: today is one of its dates). */
  ACTIVE = 'ACTIVE',
  /** Enabled, its period or its next date is still ahead. */
  SCHEDULED = 'SCHEDULED',
  /** Enabled, but no date is left. */
  ENDED = 'ENDED',
  DISABLED = 'DISABLED',
  ARCHIVED = 'ARCHIVED',
}
