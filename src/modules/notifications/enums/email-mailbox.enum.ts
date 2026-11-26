/** Klendo mailboxes on the SMTP server; each sends under its own login (`emailConfig`). */
export enum EmailMailbox {
  /** noreply: the default sender. */
  NOREPLY = 'NOREPLY',
  /** sales: billing emails, demo requests. */
  SALES = 'SALES',
  /** support: support requests, replies to account emails. */
  SUPPORT = 'SUPPORT',
}
