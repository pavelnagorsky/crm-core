import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { BookingNotificationData } from '../interfaces/booking-notification-data.interface.js';
import { BookingStatusChangeDetails } from '../interfaces/booking-status-change-details.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export type BookingStatusChangedStatus =
  'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';

export class BookingStatusChangedNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.CLIENT;
  readonly emailTemplate = EmailTemplate.BOOKING_STATUS_CHANGED;

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly status: BookingStatusChangedStatus,
    private readonly details: BookingStatusChangeDetails = {},
  ) {
    super();
  }

  override reference(): EmailReference {
    return {
      locationId: this.booking.locationId,
      bookingId: this.booking.id,
      validUntil: this.booking.startAt,
    };
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
