import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationChannel } from '../enums/notification-channel.enum.js';

export class ConfirmEmailNotification extends AbstractNotification {
  readonly strategy = DeliveryStrategy.REQUIRED;
  readonly channels = [NotificationChannel.EMAIL];
  readonly recipientEmail: string;
  readonly emailTemplate = 'confirm-email';

  constructor(
    email: string,
    private readonly confirmLink: string,
  ) {
    super();
    this.recipientEmail = email;
  }

  emailContext() {
    return { confirmLink: this.confirmLink };
  }
}
