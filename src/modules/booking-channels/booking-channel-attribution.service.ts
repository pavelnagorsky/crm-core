import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { BookingSource } from '../bookings/enums/booking-source.enum.js';
import { BookingAttribution } from '../bookings/interfaces/booking-attribution.interface.js';
import { BookingChannelStatus } from './enums/booking-channel-status.enum.js';
import { isDomainAllowed } from './allowed-domains.js';

@Injectable()
export class BookingChannelAttributionService {
  constructor(private readonly db: DatabaseService) {}

  async resolve(
    locationId: string,
    pageId: string | undefined,
    widgetId: string | undefined,
    origin: string | undefined,
  ): Promise<BookingAttribution> {
    if (pageId && widgetId) {
      throw new AppException(
        ErrorCode.BOOKING_CHANNEL_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pageId) {
      const page = await this.db.bookingPage.findFirst({
        where: {
          id: pageId,
          locationId,
          status: BookingChannelStatus.PUBLISHED,
        },
        select: { id: true },
      });
      if (!page)
        throw new AppException(
          ErrorCode.BOOKING_PAGE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return {
        source: BookingSource.PUBLIC_PAGE,
        bookingPageId: page.id,
        bookingWidgetId: null,
      };
    }
    if (widgetId) {
      const widget = await this.db.bookingWidget.findFirst({
        where: {
          id: widgetId,
          locationId,
          status: BookingChannelStatus.PUBLISHED,
        },
        select: { id: true, allowedDomains: true },
      });
      if (!widget)
        throw new AppException(
          ErrorCode.BOOKING_WIDGET_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      if (!isDomainAllowed(widget.allowedDomains, origin)) {
        throw new AppException(
          ErrorCode.WIDGET_DOMAIN_NOT_ALLOWED,
          HttpStatus.FORBIDDEN,
        );
      }
      return {
        source: BookingSource.WIDGET,
        bookingPageId: null,
        bookingWidgetId: widget.id,
      };
    }
    return {
      source: BookingSource.PUBLIC_PAGE,
      bookingPageId: null,
      bookingWidgetId: null,
    };
  }
}
