import { AbstractNotification } from './abstract.notification.js';
import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { BookingNotificationData } from './booking-notification-data.interface.js';

export type BookingStatusChangedStatus = 'CONFIRMED' | 'CANCELLED';

export class BookingStatusChangedNotification extends AbstractNotification implements HasEmailChannel {
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'booking-status-changed' as const;

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly status: BookingStatusChangedStatus,
    private readonly cancellationReason: string | undefined,
  ) {
    super();
  }

  toEmail(): ChannelPayload {
    return {
      to: this.booking.clientEmail,
      data: {
        clientFirstName: this.booking.clientFirstName,
        serviceTitle: this.booking.serviceTitle,
        staffName: this.booking.staffName,
        startAt: this.booking.startAt,
        endAt: this.booking.endAt,
        timezone: this.booking.timezone,
        status: this.status,
        cancellationReason: this.cancellationReason ?? null,
      },
    };
  }
}
