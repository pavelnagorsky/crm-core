import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { LocationService } from '../../location/services/location.service.js';
import { BookingNotificationData } from '../../notifications/interfaces/booking-notification-data.interface.js';
import { BookingReminderNotification } from '../../notifications/messages/booking-reminder.notification.js';
import { ReviewRequestNotification } from '../../notifications/messages/review-request.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import {
  reminderWindow,
  reviewRequestWindow,
} from '../rules/booking-cron.rules.js';
import { BookingClientTokenService } from './booking-client-token.service.js';

@Injectable()
export class BookingCronService {
  private readonly logger = new Logger(BookingCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly bookings: BookingsFacade,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
    private readonly reviews: ReviewsFacade,
    private readonly clientTokens: BookingClientTokenService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const { from, to } = reminderWindow(now);

    const bookings = await this.db.booking.findMany({
      where: {
        startAt: { gt: from, lte: to },
        status: BookingStatus.CONFIRMED,
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
        const claimed = await this.claim(booking.locationId, {
          where: {
            id: booking.id,
            deletedAt: null,
            reminderSentAt: null,
            updatedAt: booking.updatedAt,
            status: BookingStatus.CONFIRMED,
            location: ACTIVE_LOCATION_WHERE,
          },
          data: { reminderSentAt: now },
        });
        if (claimed)
          this.eventEmitter.emit(
            NOTIFICATION_EVENT,
            new BookingReminderNotification(
              this.notificationData(booking, locale.timezone),
            ),
          );
      }),
    );
  }

  /** Asks clients of recently completed visits for a review, once per booking. */
  @Cron(CronExpression.EVERY_HOUR)
  async sendReviewRequests(): Promise<void> {
    const now = new Date();
    const { from, to } = reviewRequestWindow(now);
    const reviewableLocation = {
      ...ACTIVE_LOCATION_WHERE,
      reviewsEnabled: true,
    } satisfies Prisma.LocationWhereInput;

    const candidates = await this.db.booking.findMany({
      where: {
        status: BookingStatus.COMPLETED,
        endAt: { gt: from, lte: to },
        clientEmail: { not: null },
        reviewRequestSentAt: null,
        deletedAt: null,
        location: reviewableLocation,
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!candidates.length) return;

    const reviewed = await this.reviews.findReviewedBookingIds(
      candidates.map((booking) => booking.id),
    );
    const bookings = candidates.filter((booking) => !reviewed.has(booking.id));
    if (!bookings.length) return;

    this.logger.log(
      `Sending review requests for ${bookings.length} booking(s)`,
    );

    const locales = await this.locationService.getLocalesByIds([
      ...new Set(bookings.map((booking) => booking.locationId)),
    ]);

    await Promise.all(
      bookings.map(async (booking) => {
        const locale = locales.get(booking.locationId);
        if (!locale) return;
        const claimed = await this.claim(booking.locationId, {
          where: {
            id: booking.id,
            deletedAt: null,
            reviewRequestSentAt: null,
            updatedAt: booking.updatedAt,
            status: BookingStatus.COMPLETED,
            location: reviewableLocation,
          },
          data: { reviewRequestSentAt: now },
        });
        if (claimed)
          this.eventEmitter.emit(
            NOTIFICATION_EVENT,
            new ReviewRequestNotification(
              this.notificationData(booking, locale.timezone),
              this.clientTokens.managementUrl(
                this.clientTokens.generateClientToken(booking.id),
              ),
            ),
          );
      }),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async completeElapsed(): Promise<void> {
    const count = await this.bookings.completeElapsed();
    if (count > 0)
      this.logger.log(`Auto-completed ${count} elapsed booking(s)`);
  }

  /** Marks the booking as notified only if it is unchanged, so each email goes out once. */
  private claim(
    locationId: string,
    update: Prisma.BookingUpdateManyArgs,
  ): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      if (
        !(await this.locationService.acquireActiveOperationLock(locationId, tx))
      )
        return false;
      const { count } = await tx.booking.updateMany(update);
      return count === 1;
    });
  }

  private notificationData(
    booking: BookingWithItems,
    timezone: string,
  ): BookingNotificationData {
    return {
      id: booking.id,
      locationId: booking.locationId,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientEmail: booking.clientEmail!,
      serviceTitle: booking.items.map((item) => item.serviceTitle).join(', '),
      staffName: [...new Set(booking.items.map((item) => item.staffName))].join(
        ', ',
      ),
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone,
    };
  }
}
