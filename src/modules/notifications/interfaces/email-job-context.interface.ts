export interface EmailJobContext {
  jobId: string;
  /** Attempt of this job, from 1; drives the backoff estimate. */
  attempt: number;
  /** pg-boss will not retry after this one. */
  lastAttempt: boolean;
}
