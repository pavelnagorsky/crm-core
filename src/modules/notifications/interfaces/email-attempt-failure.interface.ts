import { EmailErrorDetails } from './email-error-details.interface.js';

export interface EmailAttemptFailure {
  attempt: number;
  error: EmailErrorDetails;
  durationMs: number;
  /** It failed talking to the SMTP server, not preparing the email. */
  smtp: boolean;
}
