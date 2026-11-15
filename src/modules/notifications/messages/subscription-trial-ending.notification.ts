import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { SubscriptionEmailData } from '../interfaces/subscription-email-data.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export class SubscriptionTrialEndingNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'subscription-trial-ending' as const;

  constructor(
    private readonly email: string,
    private readonly data: SubscriptionEmailData,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return { to: this.email, data: { ...this.data } };
  }
}
