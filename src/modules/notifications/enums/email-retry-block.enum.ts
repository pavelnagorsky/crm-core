/** Why an email cannot be sent again. */
export enum EmailRetryBlock {
  /** Sent directly (a one-time secret or an interactive send): its content was never stored. */
  NOT_STORED = 'NOT_STORED',
  /** Waiting or being sent right now. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** The visit it is about has already started. */
  OUTDATED = 'OUTDATED',
  /** A client email while CLIENT_NOTIFICATIONS_ENABLED=false. */
  CLIENT_NOTIFICATIONS_DISABLED = 'CLIENT_NOTIFICATIONS_DISABLED',
}
