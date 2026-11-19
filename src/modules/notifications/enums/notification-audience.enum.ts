/** Who a notification is addressed to; decides whether `NOTIFICATIONS_ENABLED=false` mutes it. */
export enum NotificationAudience {
  /** A CRM account (the acting user, brand owners, staff with a login, admins, invitees). Always delivered. */
  ACCOUNT = 'ACCOUNT',

  /** A business's client, reached through contact data stored in CRM records. Muted when `NOTIFICATIONS_ENABLED=false`. */
  CLIENT = 'CLIENT',
}
