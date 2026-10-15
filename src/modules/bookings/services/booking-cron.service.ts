import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { NOTIFICATION_EVENT } from '../../notifications/notifications.service.js';
import { BookingReminderNotification } from '../../notifications/notifications/booking-reminder.notification.js';
import { LocationService } from '../../location/location.service.js';
import { BookingsService } from '../bookings.service.js';
import {
  AUTO_COMPLETABLE_STATUSES,
  reminderWindow,
} from '../rules/booking-cron.rules.js';

@Injectable()
export class BookingCronService {
  private readonly logger = new Logger(BookingCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly bookings: BookingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const { from, to } = reminderWindow(now);

    const bookings = await this.db.booking.findMany({
      where: {
        startAt: { gt: from, lte: to },
        status: { in: [...AUTO_COMPLETABLE_STATUSES] },
        clientEmail: { not: null },
        reminderSentAt: null,
        deletedAt: null,
        location: ACTIVE_LOCATION_WHERE,
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!bookings.length) return;

    this.logger.log(`Sending reminders for ${bookings.length} booking(s)`);

    const locationIds = [...new Set(bookings.map((b) => b.locationId))];
    const locales = await this.locationService.getLocalesByIds(locationIds);

    await Promise.all(
      bookings.map(async (booking) => {
        const locale = locales.get(booking.locationId);
        if (!locale) return;
        await this.db.$transaction(async (tx) => {
          if (
            !(await this.locationService.acquireActiveOperationLock(
              booking.locationId,
              tx,
            ))
          )
            return;
          const { count } = await tx.booking.updateMany({
            where: {
              id: booking.id,
              deletedAt: null,
              reminderSentAt: null,
              status: { in: [...AUTO_COMPLETABLE_STATUSES] },
              location: ACTIVE_LOCATION_WHERE,
            },
            data: { reminderSentAt: now },
          });
          if (count === 0) return;
          this.eventEmitter.emit(
            NOTIFICATION_EVENT,
            new BookingReminderNotification({
              id: booking.id,
              clientFirstName: booking.clientFirstName,
              clientLastName: booking.clientLastName,
              clientEmail: booking.clientEmail!,
              serviceTitle: booking.items
                .map((item) => item.serviceTitle)
                .join(', '),
              staffName: [
                ...new Set(booking.items.map((item) => item.staffName)),
              ].join(', '),
              startAt: booking.startAt,
              endAt: booking.endAt,
              timezone: locale.timezone,
            }),
          );
        });
      }),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async completeElapsed(): Promise<void> {
    const count = await this.bookings.completeElapsed();
    if (count > 0)
      this.logger.log(`Auto-completed ${count} elapsed booking(s)`);
  }
}
