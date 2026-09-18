import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { BookingReminderNotification } from '../notifications/notifications/booking-reminder.notification.js';
import { BookingStatus } from './enums/booking-status.enum.js';

const REMINDER_WINDOW_MINUTES = 60;
const WINDOW_BUFFER_MINUTES = 30;

@Injectable()
export class BookingReminderService {
  private readonly logger = new Logger(BookingReminderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + (REMINDER_WINDOW_MINUTES - WINDOW_BUFFER_MINUTES) * 60_000);
    const windowEnd = new Date(now.getTime() + (REMINDER_WINDOW_MINUTES + WINDOW_BUFFER_MINUTES) * 60_000);

    const bookings = await this.db.booking.findMany({
      where: {
        startAt: { gte: windowStart, lte: windowEnd },
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        clientEmail: { not: null },
        reminderSentAt: null,
        deletedAt: null,
      },
    });

    if (!bookings.length) return;

    this.logger.log(`Sending reminders for ${bookings.length} booking(s)`);

    await Promise.all(
      bookings.map(async (booking) => {
        this.eventEmitter.emit(
          NOTIFICATION_EVENT,
          new BookingReminderNotification({ ...booking, clientEmail: booking.clientEmail! }),
        );
        await this.db.booking.update({
          where: { id: booking.id },
          data: { reminderSentAt: now },
        });
      }),
    );
  }
}
