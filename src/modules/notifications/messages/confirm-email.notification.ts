import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';

export class ConfirmEmailNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.CONFIRM_EMAIL;
  override readonly durable = false;

  constructor(
    private readonly email: string,
    private readonly confirmLink: string,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return { to: this.email, data: { confirmLink: this.confirmLink } };
  }
}
