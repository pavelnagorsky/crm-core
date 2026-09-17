import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationChannel } from '../enums/notification-channel.enum.js';

export class ResetPasswordNotification extends AbstractNotification {
  readonly strategy = DeliveryStrategy.REQUIRED;
  readonly channels = [NotificationChannel.EMAIL];
  readonly recipientEmail: string;
  readonly emailTemplate = 'reset-password';

  constructor(
    email: string,
    private readonly resetLink: string,
  ) {
    super();
    this.recipientEmail = email;
  }

  emailContext() {
    return { resetLink: this.resetLink };
  }
}
