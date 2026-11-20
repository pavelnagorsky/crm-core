import { EmailTemplate } from '../enums/email-template.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

/** Sent from the admin page to check that the SMTP server takes emails. */
export class SmtpTestNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.SMTP_TEST;
  override readonly durable = false;

  constructor(
    private readonly email: string,
    private readonly sentAt: Date,
    private readonly timezone: string,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.email,
      data: { sentAt: this.sentAt, timezone: this.timezone },
    };
  }
}
