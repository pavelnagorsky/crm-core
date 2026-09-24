import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { BookingReminderNotification } from '../notifications/notifications/booking-reminder.notification.js';
import { BusinessService } from '../business/business.service.js';
import { BookingsService } from './bookings.service.js';
import { AUTO_COMPLETABLE_STATUSES, reminderWindow } from './booking-cron.rules.js';

@Injectable()
export class BookingCronService {
  private readonly logger = new Logger(BookingCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly bookings: BookingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly businessService: BusinessService,
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
      },
    });

    if (!bookings.length) return;

    this.logger.log(`Sending reminders for ${bookings.length} booking(s)`);

    const businessIds = [...new Set(bookings.map((b) => b.businessId))];
    const locales = await this.businessService.getLocalesByIds(businessIds);

    await Promise.all(
      bookings.map(async (booking) => {
        this.eventEmitter.emit(
          NOTIFICATION_EVENT,
          new BookingReminderNotification({
            ...booking,
            clientEmail: booking.clientEmail!,
            timezone: locales.get(booking.businessId)?.timezone ?? 'UTC',
          }),
        );
        await this.db.booking.update({
          where: { id: booking.id },
          data: { reminderSentAt: now },
        });
      }),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async completeElapsed(): Promise<void> {
    const count = await this.bookings.completeElapsed();
    if (count > 0) this.logger.log(`Auto-completed ${count} elapsed booking(s)`);
  }
}
