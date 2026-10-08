import { HttpStatus } from '@nestjs/common';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { BookingChannelAttributionService } from './booking-channel-attribution.service.js';
import { BookingSource } from '../../bookings/enums/booking-source.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';

function service() {
  const db = {
    bookingPage: { findFirst: vi.fn() },
    bookingWidget: { findFirst: vi.fn() },
  };
  return { db, service: new BookingChannelAttributionService(db as never) };
}

describe('BookingChannelAttributionService', () => {
  it('rejects both channel ids', async () => {
    const { service: attribution } = service();
    const error = await attribution
      .resolve('b1', 'page', 'widget', undefined)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_CHANNEL_CONFLICT');
    expect((error as AppException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('keeps an unattributed public booking on the public page source', async () => {
    const { service: attribution, db } = service();
    await expect(
      attribution.resolve('b1', undefined, undefined, undefined),
    ).resolves.toEqual({
      source: BookingSource.PUBLIC_PAGE,
      bookingPageId: null,
      bookingWidgetId: null,
    });
    expect(db.bookingPage.findFirst).not.toHaveBeenCalled();
  });

  it('requires a published page of the same location', async () => {
    const { service: attribution, db } = service();
    db.bookingPage.findFirst.mockResolvedValue(null);
    const error = await attribution
      .resolve('b1', 'page-1', undefined, undefined)
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect((error as AppException).errorCode).toBe('BOOKING_PAGE_NOT_FOUND');
    expect(db.bookingPage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'page-1',
        locationId: 'b1',
        status: BookingChannelStatus.PUBLISHED,
      },
      select: { id: true },
    });
  });

  it('rejects a widget opened from a domain that is not allowed', async () => {
    const { service: attribution, db } = service();
    db.bookingWidget.findFirst.mockResolvedValue({
      id: 'widget-1',
      allowedDomains: ['example.com'],
    });
    const error = await attribution
      .resolve('b1', undefined, 'widget-1', 'https://other.test')
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect((error as AppException).errorCode).toBe('WIDGET_DOMAIN_NOT_ALLOWED');
    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('attributes an allowed widget', async () => {
    const { service: attribution, db } = service();
    db.bookingWidget.findFirst.mockResolvedValue({
      id: 'widget-1',
      allowedDomains: [],
    });
    await expect(
      attribution.resolve('b1', undefined, 'widget-1', undefined),
    ).resolves.toEqual({
      source: BookingSource.WIDGET,
      bookingPageId: null,
      bookingWidgetId: 'widget-1',
    });
  });
});
