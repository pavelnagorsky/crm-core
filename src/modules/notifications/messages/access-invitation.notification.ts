import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export class AccessInvitationNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'access-invitation' as const;

  constructor(
    private readonly email: string,
    private readonly invitationLink: string,
    private readonly brandName: string,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.email,
      data: {
        brandName: this.brandName,
        invitationLink: this.invitationLink,
      },
    };
  }
}
