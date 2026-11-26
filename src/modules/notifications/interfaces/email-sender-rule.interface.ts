import { EmailFooter } from '../enums/email-footer.enum.js';
import { EmailMailbox } from '../enums/email-mailbox.enum.js';
import { EmailReplyTo } from '../enums/email-reply-to.enum.js';

export interface EmailSenderRule {
  from: EmailMailbox;
  /** Null: replies go to the sender. */
  replyTo: EmailReplyTo | null;
  /** What the footer says about replies. */
  footer: EmailFooter;
}
