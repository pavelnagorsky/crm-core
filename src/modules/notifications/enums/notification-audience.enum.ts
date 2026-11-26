/** Who a notification is addressed to; decides whether `CLIENT_NOTIFICATIONS_ENABLED=false` mutes it. */
export enum NotificationAudience {
  /**
   * A CRM account (the acting user, brand owners, staff with a login, admins, invitees), a Klendo
   * mailbox, or a person who wrote to Klendo and left the address themselves (support and demo
   * requests). Always delivered.
   */
  ACCOUNT = 'ACCOUNT',

  /** A business's client, reached through contact data stored in CRM records. Muted when `CLIENT_NOTIFICATIONS_ENABLED=false`. */
  CLIENT = 'CLIENT',
}
