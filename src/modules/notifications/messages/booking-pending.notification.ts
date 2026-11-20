import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { BookingNotificationData } from '../interfaces/booking-notification-data.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export class BookingPendingNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.CLIENT;
  readonly emailTemplate = EmailTemplate.BOOKING_PENDING;

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly manageLink: string,
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
      data: { ...this.booking, manageLink: this.manageLink },
    };
  }
}
