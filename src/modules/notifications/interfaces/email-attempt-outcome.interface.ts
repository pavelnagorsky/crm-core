/** One delivery attempt as the health check sees it, newest first. */
export interface EmailAttemptOutcome {
  sent: boolean;
  occurredAt: Date;
  error: string | null;
}
