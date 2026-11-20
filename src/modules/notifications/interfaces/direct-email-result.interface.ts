import { EmailErrorDetails } from './email-error-details.interface.js';

export interface DirectEmailResult {
  /** Delivery log entry; null if the log could not be written (the email was still sent). */
  messageId: string | null;
  sent: boolean;
  providerMessageId: string | null;
  durationMs: number;
  error: EmailErrorDetails | null;
}
