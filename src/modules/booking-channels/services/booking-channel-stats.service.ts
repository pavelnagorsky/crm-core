import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ErrorCodeEntry } from '../../../shared/interfaces/error-code-entry.interface.js';
import { BookingsAggregatesService } from '../../bookings/aggregates/services/bookings-aggregates.service.js';
import { BookingChannelEvent } from '../enums/booking-channel-event.enum.js';
import { BookingChannelStats } from '../interfaces/booking-channel-stats.interface.js';
import { BookingPagesService } from './booking-pages.service.js';
import { BookingWidgetsService } from './booking-widgets.service.js';

@Injectable()
export class BookingChannelStatsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly bookings: BookingsAggregatesService,
    private readonly pages: BookingPagesService,
    private readonly widgets: BookingWidgetsService,
  ) {}

  async forPages(
    locationId: string,
    ids: string[],
  ): Promise<Map<string, BookingChannelStats>> {
    if (!ids.length) return new Map();
    const [counters, counts] = await Promise.all([
      this.db.bookingPageStats.findMany({
        where: {
          pageId: { in: ids },
          page: { locationId, location: ACTIVE_LOCATION_WHERE },
        },
      }),
      this.bookings.countCreatedByChannels(locationId, ids, []),
    ]);
    const result = this.emptyStats(ids);
    for (const row of counters) {
      result.set(row.pageId, {
        views: row.views,
        formOpens: row.formOpens,
        bookings: 0,
      });
    }
    for (const row of counts) {
      const stats = row.bookingPageId
        ? result.get(row.bookingPageId)
        : undefined;
      if (stats) stats.bookings += row._count._all;
    }
    return result;
  }

  async forWidgets(
    locationId: string,
    ids: string[],
  ): Promise<Map<string, BookingChannelStats>> {
    if (!ids.length) return new Map();
    const [counters, counts] = await Promise.all([
      this.db.bookingWidgetStats.findMany({
        where: {
          widgetId: { in: ids },
          widget: { locationId, location: ACTIVE_LOCATION_WHERE },
        },
      }),
      this.bookings.countCreatedByChannels(locationId, [], ids),
    ]);
    const result = this.emptyStats(ids);
    for (const row of counters) {
      result.set(row.widgetId, {
        views: row.views,
        formOpens: row.formOpens,
        bookings: 0,
      });
    }
    for (const row of counts) {
      const stats = row.bookingWidgetId
        ? result.get(row.bookingWidgetId)
        : undefined;
      if (stats) stats.bookings += row._count._all;
    }
    return result;
  }

  async recordPage(pageId: string, event: BookingChannelEvent): Promise<void> {
    await this.pages.assertPublished(pageId);
    const field = event === BookingChannelEvent.VIEW ? 'views' : 'formOpens';
    try {
      await this.db.bookingPageStats.upsert({
        where: { pageId },
        create: { pageId, [field]: 1 },
        update: { [field]: { increment: 1 } },
      });
    } catch (error: unknown) {
      this.rethrowDeletedChannel(error, ErrorCode.BOOKING_PAGE_NOT_FOUND);
    }
  }

  async recordWidget(
    widgetId: string,
    event: BookingChannelEvent,
    origin?: string,
  ): Promise<void> {
    await this.widgets.getPublished(widgetId, origin);
    const field = event === BookingChannelEvent.VIEW ? 'views' : 'formOpens';
    try {
      await this.db.bookingWidgetStats.upsert({
        where: { widgetId },
        create: { widgetId, [field]: 1 },
        update: { [field]: { increment: 1 } },
      });
    } catch (error: unknown) {
      this.rethrowDeletedChannel(error, ErrorCode.BOOKING_WIDGET_NOT_FOUND);
    }
  }

  private emptyStats(ids: string[]): Map<string, BookingChannelStats> {
    return new Map(
      ids.map((id) => [id, { views: 0, formOpens: 0, bookings: 0 }]),
    );
  }

  private rethrowDeletedChannel(error: unknown, code: ErrorCodeEntry): never {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION
    ) {
      throw new AppException(code, HttpStatus.NOT_FOUND);
    }
    throw error;
  }
}
