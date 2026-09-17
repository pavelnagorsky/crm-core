import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationChannel } from '../enums/notification-channel.enum.js';
import { BookingNotificationData } from './booking-notification-data.interface.js';

export class BookingConfirmedNotification extends AbstractNotification {
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly channels = [NotificationChannel.EMAIL];
  readonly recipientEmail: string | undefined;
  readonly emailTemplate = 'booking-confirmed';

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly manageLink: string,
  ) {
    super();
    this.recipientEmail = booking.clientEmail ?? undefined;
  }

  emailContext() {
    return {
      clientFirstName: this.booking.clientFirstName,
      serviceTitle: this.booking.serviceTitle,
      staffName: this.booking.staffName,
      startAt: this.booking.startAt,
      endAt: this.booking.endAt,
      manageLink: this.manageLink,
    };
  }
}
