import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { BookingNotificationData } from '../interfaces/booking-notification-data.interface.js';
import { BookingStatusChangeDetails } from '../interfaces/booking-status-change-details.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export type BookingStatusChangedStatus =
  'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';

export class BookingStatusChangedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'booking-status-changed' as const;

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly status: BookingStatusChangedStatus,
    private readonly details: BookingStatusChangeDetails = {},
  ) {
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
        status: this.status,
        variant: this.status,
        cancellationReason: this.details.cancellationReason ?? null,
        previousStartAt: this.details.previousStartAt ?? null,
        manageLink: this.details.manageLink ?? null,
      },
    };
  }
}
