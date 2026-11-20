import { EmailAudience, EmailMessage, EmailStatus } from '@prisma/client';
import { EmailRetryBlock } from '../enums/email-retry-block.enum.js';

const IN_PROGRESS: ReadonlySet<EmailStatus> = new Set([
  EmailStatus.QUEUED,
  EmailStatus.SENDING,
  EmailStatus.RETRYING,
]);

export const CANCELLABLE_STATUSES: EmailStatus[] = [
  EmailStatus.QUEUED,
  EmailStatus.RETRYING,
  EmailStatus.FAILED,
];

export const TERMINAL_STATUSES: EmailStatus[] = [
  EmailStatus.SENT,
  EmailStatus.FAILED,
  EmailStatus.SKIPPED,
  EmailStatus.CANCELLED,
];

type RetryCheck = Pick<
  EmailMessage,
  'payload' | 'status' | 'validUntil' | 'audience'
>;

/** Null when the email may be sent again (a sent one too: the client may have lost it). */
export function emailRetryBlock(
  message: RetryCheck,
  clientNotificationsEnabled: boolean,
  now: Date,
): EmailRetryBlock | null {
  if (message.payload === null) return EmailRetryBlock.NOT_STORED;
  if (IN_PROGRESS.has(message.status)) return EmailRetryBlock.IN_PROGRESS;
  if (message.validUntil && message.validUntil <= now)
    return EmailRetryBlock.OUTDATED;
  if (message.audience === EmailAudience.CLIENT && !clientNotificationsEnabled)
    return EmailRetryBlock.CLIENT_NOTIFICATIONS_DISABLED;
  return null;
}

export function isEmailCancellable(message: Pick<EmailMessage, 'status'>) {
  return CANCELLABLE_STATUSES.includes(message.status);
}
