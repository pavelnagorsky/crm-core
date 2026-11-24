/** Outcome of an `@ExclusiveCron` run: the `result` label of `klendo_cron_runs_total`. */
export enum CronRunResult {
  SUCCESS = 'success',
  /** The method threw. */
  ERROR = 'error',
  /** Another process holds the lock of this minute. */
  SKIPPED = 'skipped',
}
