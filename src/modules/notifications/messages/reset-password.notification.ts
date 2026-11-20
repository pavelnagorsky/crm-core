import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';

export class ResetPasswordNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.RESET_PASSWORD;
  override readonly durable = false;

  constructor(
    private readonly email: string,
    private readonly code: string,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return { to: this.email, data: { code: this.code } };
  }
}
