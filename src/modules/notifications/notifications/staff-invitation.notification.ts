import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationChannel } from '../enums/notification-channel.enum.js';

export class StaffInvitationNotification extends AbstractNotification {
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly channels = [NotificationChannel.EMAIL];
  readonly recipientEmail: string;
  readonly emailTemplate = 'staff-invitation';

  constructor(
    email: string,
    private readonly invitationLink: string,
    private readonly staffName: string,
    private readonly businessName: string,
  ) {
    super();
    this.recipientEmail = email;
  }

  emailContext() {
    return {
      staffName: this.staffName,
      businessName: this.businessName,
      invitationLink: this.invitationLink,
    };
  }
}
