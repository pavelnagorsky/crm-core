export const EMAIL_QUEUE = 'notification-email';
/** Jobs pg-boss gave up on outside the worker (an attempt cut off by a restart); the worker marks them failed. */
export const EMAIL_DEAD_LETTER_QUEUE = 'notification-email-failed';

export const EMAIL_MAX_ATTEMPTS = 6;
const RETRY_DELAY_SECONDS = 30;
const RETRY_DELAY_MAX_SECONDS = 15 * 60;

const JOB_RETENTION = {
  /** A job only carries the message id; the email itself lives in the delivery log. */
  deleteAfterSeconds: 24 * 60 * 60,
  retentionSeconds: 7 * 24 * 60 * 60,
};

export const EMAIL_QUEUE_OPTIONS = {
  ...JOB_RETENTION,
  /** Six attempts over 15-30 minutes: gaps of 30-60s, doubling each time, with jitter. */
  retryLimit: EMAIL_MAX_ATTEMPTS - 1,
  retryDelay: RETRY_DELAY_SECONDS,
  retryBackoff: true,
  retryDelayMax: RETRY_DELAY_MAX_SECONDS,
  /** Three SMTP timeouts plus rendering; an attempt cut off by a hard kill comes back after this. */
  expireInSeconds: 120,
};

export const EMAIL_DEAD_LETTER_OPTIONS = JOB_RETENTION;

/** pg-boss backoff for the attempt that just failed: the earliest the next one may start. */
export function emailRetryDelaySeconds(failedAttempt: number): number {
  return Math.min(
    RETRY_DELAY_MAX_SECONDS,
    RETRY_DELAY_SECONDS * 2 ** Math.max(0, failedAttempt - 1),
  );
}

/** Parallel sends per instance: keeps a burst of reminders within the SMTP provider's limits. */
export const EMAIL_WORKER_CONCURRENCY = 3;
export const EMAIL_LOG_RETENTION_DAYS = 90;
/** Most emails one bulk retry or cancel touches. */
export const EMAIL_BULK_LIMIT = 1000;
/** A queued email without a job (the queue was down) is handed to the queue after this. */
export const EMAIL_ORPHAN_AFTER_MS = 60_000;
