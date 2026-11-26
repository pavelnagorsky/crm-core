/** Where a reply to an email goes, when not to the sender. */
export enum EmailReplyTo {
  SUPPORT = 'SUPPORT',
  /** The person who wrote to Klendo: the address the notification put in `data.replyTo`, so a retry keeps it. */
  REQUESTER = 'REQUESTER',
}
