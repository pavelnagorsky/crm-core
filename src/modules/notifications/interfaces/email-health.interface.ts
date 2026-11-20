import { EmailHealthStatus } from '../enums/email-health-status.enum.js';

export interface EmailHealth {
  status: EmailHealthStatus;
  /** Failed attempts since the last successful one. */
  consecutiveFailures: number;
  lastSentAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}
