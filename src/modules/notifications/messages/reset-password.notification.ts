import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export class ResetPasswordNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.REQUIRED;
  readonly emailTemplate = 'reset-password' as const;

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
