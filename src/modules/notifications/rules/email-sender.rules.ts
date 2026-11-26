import { EmailFooter } from '../enums/email-footer.enum.js';
import { EmailMailbox } from '../enums/email-mailbox.enum.js';
import { EmailReplyTo } from '../enums/email-reply-to.enum.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailSenderRule } from '../interfaces/email-sender-rule.interface.js';
import { EmailSender } from '../interfaces/email-sender.interface.js';

/** The payload key holding the requester's address for `EmailReplyTo.REQUESTER`. */
export const EMAIL_REPLY_TO_KEY = 'replyTo';

/** Nobody expects a reply. */
const NOREPLY: EmailSenderRule = {
  from: EmailMailbox.NOREPLY,
  replyTo: null,
  footer: EmailFooter.NO_REPLY,
};
/** An email to a CRM account: nobody expects a reply, but one would reach support. */
const NOREPLY_TO_SUPPORT: EmailSenderRule = {
  from: EmailMailbox.NOREPLY,
  replyTo: EmailReplyTo.SUPPORT,
  footer: EmailFooter.NO_REPLY,
};
/** Sent by sales; a manager reads replies. */
const SALES: EmailSenderRule = {
  from: EmailMailbox.SALES,
  replyTo: null,
  footer: EmailFooter.SALES,
};
/** Forwarded to a Klendo mailbox: pressing Reply writes to the requester. */
const NOREPLY_TO_REQUESTER: EmailSenderRule = {
  from: EmailMailbox.NOREPLY,
  replyTo: EmailReplyTo.REQUESTER,
  footer: EmailFooter.TO_CLIENT,
};

/**
 * Sender, Reply-To and the footer line about replies, per template. Decided by the template, so a
 * retry from the log sends from the same mailbox. Emails to a business's clients get no Reply-To:
 * a reply there is meant for the salon.
 */
export const EMAIL_SENDER_RULES: Record<EmailTemplate, EmailSenderRule> = {
  [EmailTemplate.CONFIRM_EMAIL]: NOREPLY_TO_SUPPORT,
  [EmailTemplate.RESET_PASSWORD]: NOREPLY_TO_SUPPORT,
  [EmailTemplate.ACCESS_INVITATION]: NOREPLY_TO_SUPPORT,
  [EmailTemplate.STAFF_BOOKING_EVENT]: NOREPLY_TO_SUPPORT,
  [EmailTemplate.BOOKING_CONFIRMED]: NOREPLY,
  [EmailTemplate.BOOKING_PENDING]: NOREPLY,
  [EmailTemplate.BOOKING_STATUS_CHANGED]: NOREPLY,
  [EmailTemplate.BOOKING_REMINDER]: NOREPLY,
  [EmailTemplate.REVIEW_REQUEST]: NOREPLY,
  [EmailTemplate.SUBSCRIPTION_TRIAL_ENDING]: SALES,
  [EmailTemplate.SUBSCRIPTION_PERIOD_ENDING]: SALES,
  [EmailTemplate.SUBSCRIPTION_ACCESS_ENDED]: SALES,
  [EmailTemplate.SUBSCRIPTION_ACCESS_LIMITED]: SALES,
  [EmailTemplate.SUBSCRIPTION_PAYMENT_REQUESTED]: SALES,
  [EmailTemplate.SUBSCRIPTION_PAYMENT_RECEIVED]: SALES,
  [EmailTemplate.ADMIN_SUBSCRIPTION_PAYMENT_REQUESTED]: NOREPLY,
  [EmailTemplate.SMTP_TEST]: NOREPLY,
  [EmailTemplate.SUPPORT_REQUEST_RECEIVED]: {
    from: EmailMailbox.NOREPLY,
    replyTo: EmailReplyTo.SUPPORT,
    footer: EmailFooter.SUPPORT_REQUEST,
  },
  [EmailTemplate.SUPPORT_REQUEST_FORWARDED]: NOREPLY_TO_REQUESTER,
  [EmailTemplate.FEEDBACK_RECEIVED]: SALES,
  [EmailTemplate.FEEDBACK_FORWARDED]: NOREPLY_TO_REQUESTER,
};

/**
 * The From address and Reply-To of an email, from mailbox addresses by role. No Reply-To when the
 * requester address is missing or when it equals the sender (one mailbox for all roles on dev).
 */
export function resolveEmailSender(
  template: EmailTemplate,
  data: Record<string, unknown>,
  mailboxes: Record<EmailMailbox, string>,
): EmailSender {
  const rule = EMAIL_SENDER_RULES[template];
  const address = mailboxes[rule.from];
  const reply = replyTo(rule, data, mailboxes);
  return { address, replyTo: reply === address ? null : reply };
}

function replyTo(
  rule: EmailSenderRule,
  data: Record<string, unknown>,
  mailboxes: Record<EmailMailbox, string>,
): string | null {
  switch (rule.replyTo) {
    case null:
      return null;
    case EmailReplyTo.SUPPORT:
      return mailboxes[EmailMailbox.SUPPORT];
    case EmailReplyTo.REQUESTER: {
      const address = data[EMAIL_REPLY_TO_KEY];
      return typeof address === 'string' && address.trim()
        ? address.trim()
        : null;
    }
  }
}
