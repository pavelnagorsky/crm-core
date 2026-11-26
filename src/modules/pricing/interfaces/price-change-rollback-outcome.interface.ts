/** What a rollback did: restored rows and the price each touched row had before it. */
export interface PriceChangeRollbackOutcome {
  restoredCount: number;
  /** Minor units by item id, for the rows the rollback looked at (applied rows). */
  currents: Map<string, number | null>;
}
