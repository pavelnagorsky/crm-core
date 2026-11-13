import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { ChannelPayload } from '../interfaces/channel-payload.interface.js';
import { HasEmailChannel } from '../interfaces/has-email-channel.interface.js';
import { StaffBookingNotificationData } from '../interfaces/staff-booking-notification-data.interface.js';
import { AbstractNotification } from './abstract.notification.js';

export class StaffBookingNotification
  extends AbstractNotification
  implements HasEmailChannel
{
  readonly strategy = DeliveryStrategy.BEST_EFFORT;
  readonly emailTemplate = 'staff-booking-event' as const;

  constructor(private readonly data: StaffBookingNotificationData) {
    super();
  }

  toEmail(): ChannelPayload {
    const { recipientEmail, event, ...data } = this.data;
    return { to: recipientEmail, data: { ...data, variant: event } };
  }
}
