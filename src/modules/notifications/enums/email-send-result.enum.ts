/** Outcome of one SMTP send: the `result` label of `klendo_email_send_duration_seconds`. */
export enum EmailSendResult {
  SENT = 'sent',
  FAILED = 'failed',
}
