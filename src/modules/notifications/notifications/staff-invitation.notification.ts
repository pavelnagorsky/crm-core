import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';

export class StaffInvitationNotification extends AbstractNotification implements HasEmailChannel {
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'staff-invitation' as const;

  constructor(
    private readonly email: string,
    private readonly invitationLink: string,
    private readonly staffName: string,
    private readonly businessName: string,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.email,
      data: { staffName: this.staffName, businessName: this.businessName, invitationLink: this.invitationLink },
    };
  }
}
