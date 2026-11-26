import { EmailTemplate } from '../enums/email-template.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { FeedbackEmailData } from '../interfaces/feedback-email-data.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

/** Tells the author of a demo request that sales got it. Sent only when they left an email. */
export class FeedbackReceivedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.FEEDBACK_RECEIVED;

  constructor(
    private readonly email: string,
    private readonly feedback: FeedbackEmailData,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    const { name, company, phone, email, message } = this.feedback;
    return {
      to: this.email,
      data: { name, company, phone, email, message },
    };
  }
}
