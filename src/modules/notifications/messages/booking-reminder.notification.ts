import { TimeUtils } from '../../../shared/time/time.utils.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';
import { BookingNotificationData } from '../interfaces/booking-notification-data.interface.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from './abstract.notification.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailReference } from '../interfaces/email-reference.interface.js';

export class BookingReminderNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly audience = NotificationAudience.CLIENT;
  readonly emailTemplate = EmailTemplate.BOOKING_REMINDER;

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
      data: {
        locationId: this.booking.locationId,
        clientFirstName: this.booking.clientFirstName,
        serviceTitle: this.booking.serviceTitle,
        staffName: this.booking.staffName,
        startAt: this.booking.startAt,
        endAt: this.booking.endAt,
        timezone: this.booking.timezone,
        manageLink: this.manageLink,
        variant: this.day(),
      },
    };
  }

  /** "Today" or "tomorrow" in the location's calendar, as the client reads the email now. */
  private day(): 'TODAY' | 'TOMORROW' | 'LATER' {
    const { startAt, timezone } = this.booking;
    const now = new Date();
    const visit = TimeUtils.zonedDateStr(startAt, timezone);
    if (visit === TimeUtils.zonedDateStr(now, timezone)) return 'TODAY';
    if (
      visit ===
      TimeUtils.zonedDateStr(TimeUtils.addDaysInTz(now, 1, timezone), timezone)
    )
      return 'TOMORROW';
    return 'LATER';
  }
}
