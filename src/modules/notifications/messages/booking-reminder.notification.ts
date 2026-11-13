import { TimeUtils } from '../../../shared/time/time.utils.js';
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

  constructor(
    private readonly booking: BookingNotificationData,
    private readonly manageLink: string,
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
