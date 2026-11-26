/** Resolved sender of one email. */
export interface EmailSender {
  /** The mailbox address; also the SMTP login. */
  address: string;
  replyTo: string | null;
}
