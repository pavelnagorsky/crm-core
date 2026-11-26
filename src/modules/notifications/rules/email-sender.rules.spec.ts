import { EmailFooter } from '../enums/email-footer.enum.js';
import { EmailMailbox } from '../enums/email-mailbox.enum.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import {
  EMAIL_SENDER_RULES,
  resolveEmailSender,
} from './email-sender.rules.js';

const MAILBOXES: Record<EmailMailbox, string> = {
  [EmailMailbox.NOREPLY]: 'noreply@klendo.by',
  [EmailMailbox.SALES]: 'sales@klendo.by',
  [EmailMailbox.SUPPORT]: 'support@klendo.by',
};

describe('resolveEmailSender', () => {
  it('has a rule for every template', () => {
    expect(Object.keys(EMAIL_SENDER_RULES).sort()).toEqual(
      Object.values(EmailTemplate).sort(),
    );
  });

  it.each([
    EmailTemplate.SUBSCRIPTION_TRIAL_ENDING,
    EmailTemplate.SUBSCRIPTION_PERIOD_ENDING,
    EmailTemplate.SUBSCRIPTION_ACCESS_ENDED,
    EmailTemplate.SUBSCRIPTION_ACCESS_LIMITED,
    EmailTemplate.SUBSCRIPTION_PAYMENT_REQUESTED,
    EmailTemplate.SUBSCRIPTION_PAYMENT_RECEIVED,
    EmailTemplate.FEEDBACK_RECEIVED,
  ])('sends %s from sales without Reply-To', (template) => {
    expect(resolveEmailSender(template, {}, MAILBOXES)).toEqual({
      address: 'sales@klendo.by',
      replyTo: null,
    });
    expect(EMAIL_SENDER_RULES[template].footer).toBe(EmailFooter.SALES);
  });

  it('keeps the standard footer on every noreply email that expects no reply', () => {
    const footers = Object.fromEntries(
      Object.entries(EMAIL_SENDER_RULES).map(([template, rule]) => [
        template,
        rule.footer,
      ]),
    );
    expect(footers).toMatchObject({
      [EmailTemplate.CONFIRM_EMAIL]: EmailFooter.NO_REPLY,
      [EmailTemplate.RESET_PASSWORD]: EmailFooter.NO_REPLY,
      [EmailTemplate.ACCESS_INVITATION]: EmailFooter.NO_REPLY,
      [EmailTemplate.STAFF_BOOKING_EVENT]: EmailFooter.NO_REPLY,
      [EmailTemplate.BOOKING_REMINDER]: EmailFooter.NO_REPLY,
      [EmailTemplate.SMTP_TEST]: EmailFooter.NO_REPLY,
      [EmailTemplate.SUPPORT_REQUEST_RECEIVED]: EmailFooter.SUPPORT_REQUEST,
      [EmailTemplate.SUPPORT_REQUEST_FORWARDED]: EmailFooter.TO_CLIENT,
      [EmailTemplate.FEEDBACK_FORWARDED]: EmailFooter.TO_CLIENT,
    });
  });

  it.each([
    EmailTemplate.CONFIRM_EMAIL,
    EmailTemplate.RESET_PASSWORD,
    EmailTemplate.ACCESS_INVITATION,
    EmailTemplate.STAFF_BOOKING_EVENT,
    EmailTemplate.SUPPORT_REQUEST_RECEIVED,
  ])('sends %s from noreply with Reply-To support', (template) => {
    expect(resolveEmailSender(template, {}, MAILBOXES)).toEqual({
      address: 'noreply@klendo.by',
      replyTo: 'support@klendo.by',
    });
  });

  it.each([
    EmailTemplate.BOOKING_CONFIRMED,
    EmailTemplate.BOOKING_PENDING,
    EmailTemplate.BOOKING_STATUS_CHANGED,
    EmailTemplate.BOOKING_REMINDER,
    EmailTemplate.REVIEW_REQUEST,
    EmailTemplate.ADMIN_SUBSCRIPTION_PAYMENT_REQUESTED,
    EmailTemplate.SMTP_TEST,
  ])('sends %s from noreply without Reply-To', (template) => {
    expect(
      resolveEmailSender(template, { replyTo: 'x@example.com' }, MAILBOXES),
    ).toEqual({ address: 'noreply@klendo.by', replyTo: null });
  });

  it.each([
    EmailTemplate.SUPPORT_REQUEST_FORWARDED,
    EmailTemplate.FEEDBACK_FORWARDED,
  ])('points %s at the requester stored in the data', (template) => {
    expect(
      resolveEmailSender(
        template,
        { replyTo: ' author@example.com ' },
        MAILBOXES,
      ),
    ).toEqual({ address: 'noreply@klendo.by', replyTo: 'author@example.com' });
    expect(
      resolveEmailSender(template, { replyTo: null }, MAILBOXES).replyTo,
    ).toBeNull();
    expect(resolveEmailSender(template, {}, MAILBOXES).replyTo).toBeNull();
  });

  it('drops a Reply-To equal to the sender when all roles share one mailbox', () => {
    const single = {
      [EmailMailbox.NOREPLY]: 'test@example.com',
      [EmailMailbox.SALES]: 'test@example.com',
      [EmailMailbox.SUPPORT]: 'test@example.com',
    };
    expect(
      resolveEmailSender(EmailTemplate.RESET_PASSWORD, {}, single),
    ).toEqual({ address: 'test@example.com', replyTo: null });
    expect(
      resolveEmailSender(EmailTemplate.SUBSCRIPTION_TRIAL_ENDING, {}, single),
    ).toEqual({ address: 'test@example.com', replyTo: null });
  });
});
