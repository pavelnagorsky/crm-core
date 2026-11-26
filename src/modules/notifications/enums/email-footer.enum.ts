/** The footer line about replies; values are keys of `email.common.footers`. */
export enum EmailFooter {
  /** The standard "sent automatically, no need to reply" line. */
  NO_REPLY = 'noReply',
  /** Sent from sales: a manager reads the reply. */
  SALES = 'sales',
  /** A reply adds to the support request. */
  SUPPORT_REQUEST = 'supportRequest',
  /** Forwarded to a Klendo mailbox: a reply goes to the client. */
  TO_CLIENT = 'toClient',
}
