import { EmailHealthStatus } from '../enums/email-health-status.enum.js';
import { EmailAttemptOutcome } from '../interfaces/email-attempt-outcome.interface.js';
import { EmailHealth } from '../interfaces/email-health.interface.js';

/** Failed attempts in a row that mean the SMTP server is not taking emails. */
const DOWN_AFTER_FAILURES = 3;
const DEGRADED_WINDOW_MS = 60 * 60_000;

/** SMTP health from the latest attempts, newest first. */
export function emailHealth(
  outcomes: EmailAttemptOutcome[],
  queueReady: boolean,
  now: Date,
): EmailHealth {
  const firstSent = outcomes.find((outcome) => outcome.sent) ?? null;
  const firstFailure = outcomes.find((outcome) => !outcome.sent) ?? null;
  const leadingFailures = outcomes.findIndex((outcome) => outcome.sent);
  const consecutiveFailures =
    leadingFailures === -1 ? outcomes.length : leadingFailures;
  const recentFailure =
    firstFailure !== null &&
    now.getTime() - firstFailure.occurredAt.getTime() < DEGRADED_WINDOW_MS;

  let status = EmailHealthStatus.OK;
  if (!queueReady || consecutiveFailures >= DOWN_AFTER_FAILURES)
    status = EmailHealthStatus.DOWN;
  else if (!outcomes.length) status = EmailHealthStatus.IDLE;
  else if (consecutiveFailures > 0 || recentFailure)
    status = EmailHealthStatus.DEGRADED;

  return {
    status,
    consecutiveFailures,
    lastSentAt: firstSent?.occurredAt ?? null,
    lastFailureAt: firstFailure?.occurredAt ?? null,
    lastError: firstFailure?.error ?? null,
  };
}
