import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { BookingNotificationData } from '../interfaces/booking-notification-data.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export class BookingReminderNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'booking-reminder' as const;

  constructor(private readonly booking: BookingNotificationData) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.booking.clientEmail,
      data: {
        locationId: this.booking.locationId,
        clientFirstName: this.booking.clientFirstName,
        serviceTitle: this.booking.serviceTitle,
        staffName: this.booking.staffName,
        startAt: this.booking.startAt,
        endAt: this.booking.endAt,
        timezone: this.booking.timezone,
      },
    };
  }
}
