import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { SubscriptionEmailData } from '../interfaces/subscription-email-data.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export class SubscriptionAccessEndedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.SUBSCRIPTION_ACCESS_ENDED;

  constructor(
    private readonly email: string,
    private readonly data: SubscriptionEmailData,
  ) {
    super();
  }

  override reference(): EmailReference {
    return { brandId: this.data.brandId };
  }

  toEmail(): ChannelPayload {
    return { to: this.email, data: { ...this.data } };
  }
}
