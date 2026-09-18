import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';

export class ConfirmEmailNotification extends AbstractNotification implements HasEmailChannel {
  readonly strategy = DeliveryStrategy.REQUIRED;
  readonly emailTemplate = 'confirm-email' as const;

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
