import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IFrontendConfig } from '../../../config/interfaces/frontend-config.interface.js';
import { AccessService } from '../../access/services/access.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { StaffBookingEvent } from '../../notifications/enums/staff-booking-event.enum.js';
import { StaffBookingNotification } from '../../notifications/messages/staff-booking.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

/** Emails the location's managers and the booking's staff about what a client did. */
@Injectable()
export class BookingStaffNotificationService {
  private readonly logger = new Logger(BookingStaffNotificationService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly staff: StaffService,
    private readonly access: AccessService,
    private readonly locations: LocationService,
    private readonly config: ConfigService,
  ) {}

  /** Never throws: the client's booking stands even if staff cannot be told. */
  async notify(
    booking: BookingWithItems,
    event: StaffBookingEvent,
    previousStartAt: Date | null = null,
  ): Promise<void> {
    try {
      const staffUserIds = await this.staff.findLinkedUserIds(
        booking.locationId,
        booking.items.map((item) => item.staffId),
      );
      const recipients = (
        await this.access.bookingNotificationRecipients(
          booking.locationId,
          staffUserIds,
        )
      ).filter(
        (user): user is typeof user & { email: string } => user.email !== null,
      );
      if (!recipients.length) return;
      const { timezone } = await this.locations.getLocale(booking.locationId);
      const bookingUrl = this.bookingUrl(booking);
      for (const recipient of recipients)
        this.eventEmitter.emit(
          NOTIFICATION_EVENT,
          new StaffBookingNotification({
            event,
            recipientEmail: recipient.email,
            recipientFirstName: recipient.firstName,
            locationId: booking.locationId,
            clientName: [booking.clientFirstName, booking.clientLastName]
              .filter(Boolean)
              .join(' '),
            clientPhone: booking.clientPhone,
            serviceTitle: booking.items
              .map((item) => item.serviceTitle)
              .join(', '),
            staffName: [
              ...new Set(booking.items.map((item) => item.staffName)),
            ].join(', '),
            startAt: booking.startAt,
            endAt: booking.endAt,
            timezone,
            previousStartAt,
            cancellationReason: booking.cancellationReason,
            bookingUrl,
          }),
        );
      this.logger.log(
        `staff notified: bookingId=${booking.id} event=${event} recipients=${recipients.length}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify staff about booking ${booking.id} (${event})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private bookingUrl(booking: BookingWithItems): string {
    const domain = this.config.get<IFrontendConfig>('frontend')!.domain;
    return new URL(
      `/app/locations/${booking.locationId}/bookings/${booking.id}`,
      domain,
    ).toString();
  }
}
