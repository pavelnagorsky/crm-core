import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { StaffBookingNotificationData } from '../interfaces/staff-booking-notification-data.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export class StaffBookingNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.ACCOUNT;
  readonly emailTemplate = EmailTemplate.STAFF_BOOKING_EVENT;

  constructor(private readonly data: StaffBookingNotificationData) {
    super();
  }

  override reference(): EmailReference {
    return {
      locationId: this.data.locationId,
      bookingId: this.data.bookingId,
      validUntil: this.data.endAt,
    };
  }

  toEmail(): ChannelPayload {
    const { recipientEmail, event, ...data } = this.data;
    return { to: recipientEmail, data: { ...data, variant: event } };
  }
}
