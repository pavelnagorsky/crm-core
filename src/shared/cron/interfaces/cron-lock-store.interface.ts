/** One run of a cron per minute slot, across whatever processes share the store. */
export interface CronLockStore {
  /** Claims the run of cron `name` in minute `slot`: true for the first claimant, false for every later one. */
  tryAcquire(name: string, slot: number): Promise<boolean>;
}
