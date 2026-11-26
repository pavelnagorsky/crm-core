import { EmailTemplate } from '../enums/email-template.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { FeedbackEmailData } from '../interfaces/feedback-email-data.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { EMAIL_REPLY_TO_KEY } from '../rules/email-sender.rules.js';
import { AbstractNotification } from './abstract.notification.js';

/** A new demo request in the sales mailbox; Reply answers the author when they left an email. */
export class FeedbackForwardedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.FEEDBACK_FORWARDED;

  constructor(
    private readonly salesEmail: string,
    private readonly feedback: FeedbackEmailData,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.salesEmail,
      data: { ...this.feedback, [EMAIL_REPLY_TO_KEY]: this.feedback.email },
    };
  }
}
