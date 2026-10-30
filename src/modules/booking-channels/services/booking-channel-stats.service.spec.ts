import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { BookingChannelEvent } from '../enums/booking-channel-event.enum.js';
import { BookingChannelStatsService } from './booking-channel-stats.service.js';
import { BookingPagesService } from './booking-pages.service.js';
import { BookingWidgetsService } from './booking-widgets.service.js';

function fixture() {
  const db = {
    bookingPage: { findFirst: vi.fn().mockResolvedValue({ id: 'page' }) },
    bookingWidget: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'widget', allowedDomains: [] }),
    },
    bookingPageStats: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    bookingWidgetStats: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
  };
  const bookings = { countCreatedByChannels: vi.fn().mockResolvedValue([]) };
  const pages = new BookingPagesService(db as never, {} as never, {} as never);
  const widgets = new BookingWidgetsService(db as never, {} as never);
  return {
    db,
    bookings,
    service: new BookingChannelStatsService(
      db as never,
      bookings as never,
      pages,
      widgets,
    ),
  };
}

describe.each(['page', 'widget'] as const)(
  'BookingChannelStatsService %s',
  (kind) => {
    const record = (
      service: BookingChannelStatsService,
      event: BookingChannelEvent,
    ) =>
      kind === 'page'
        ? service.recordPage('id', event)
        : service.recordWidget('id', event, 'https://example.com');

    it('increments each event atomically without updating channel content', async () => {
      const { service, db } = fixture();
      for (const [event, field] of [
        [BookingChannelEvent.VIEW, 'views'],
        [BookingChannelEvent.FORM_OPEN, 'formOpens'],
      ] as const) {
        await record(service, event);
        const repository =
          kind === 'page' ? db.bookingPageStats : db.bookingWidgetStats;
        const id = kind === 'page' ? 'pageId' : 'widgetId';
        expect(repository.upsert).toHaveBeenLastCalledWith({
          where: { [id]: 'id' },
          create: { [id]: 'id', [field]: 1 },
          update: { [field]: { increment: 1 } },
        });
      }
      const channel = kind === 'page' ? db.bookingPage : db.bookingWidget;
      expect(channel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'id',
            status: 'PUBLISHED',
            location: ACTIVE_LOCATION_WHERE,
          },
        }),
      );
    });

    it('rejects unavailable channels before writing', async () => {
      const { service, db } = fixture();
      db.bookingPage.findFirst.mockResolvedValue(null);
      db.bookingWidget.findFirst.mockResolvedValue(null);
      await expect(
        record(service, BookingChannelEvent.VIEW),
      ).rejects.toMatchObject({ status: 404 });
      expect(db.bookingPageStats.upsert).not.toHaveBeenCalled();
      expect(db.bookingWidgetStats.upsert).not.toHaveBeenCalled();
    });

    it('handles deletion between validation and increment', async () => {
      const { service, db } = fixture();
      const repository =
        kind === 'page' ? db.bookingPageStats : db.bookingWidgetStats;
      repository.upsert.mockRejectedValue({
        code: PrismaErrorCode.FOREIGN_KEY_VIOLATION,
      });
      await expect(
        record(service, BookingChannelEvent.VIEW),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('loads totals in batches and supplies zeros for missing counters', async () => {
      const { service, db, bookings } = fixture();
      const repository =
        kind === 'page' ? db.bookingPageStats : db.bookingWidgetStats;
      const id = kind === 'page' ? 'pageId' : 'widgetId';
      const relation = kind === 'page' ? 'bookingPageId' : 'bookingWidgetId';
      repository.findMany.mockResolvedValue([
        { [id]: 'first', views: 20, formOpens: 7 },
      ]);
      bookings.countCreatedByChannels.mockResolvedValue([
        { [relation]: 'first', _count: { _all: 3 } },
        { [relation]: 'second', _count: { _all: 1 } },
      ]);
      const ids = ['first', 'second', 'third'];
      const result =
        kind === 'page'
          ? await service.forPages('location', ids)
          : await service.forWidgets('location', ids);
      expect(result.get('first')).toEqual({
        views: 20,
        formOpens: 7,
        bookings: 3,
      });
      expect(result.get('second')).toEqual({
        views: 0,
        formOpens: 0,
        bookings: 1,
      });
      expect(result.get('third')).toEqual({
        views: 0,
        formOpens: 0,
        bookings: 0,
      });
      expect(repository.findMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          [id]: { in: ids },
          [kind]: { locationId: 'location', location: ACTIVE_LOCATION_WHERE },
        },
      });
      expect(bookings.countCreatedByChannels).toHaveBeenCalledExactlyOnceWith(
        'location',
        kind === 'page' ? ids : [],
        kind === 'widget' ? ids : [],
      );
    });
  },
);

it('rejects widget events from missing or forbidden origins', async () => {
  const { service, db } = fixture();
  db.bookingWidget.findFirst.mockResolvedValue({
    id: 'widget',
    allowedDomains: ['example.com'],
  });
  for (const origin of [undefined, 'https://attacker.com']) {
    await expect(
      service.recordWidget('widget', BookingChannelEvent.VIEW, origin),
    ).rejects.toMatchObject({ status: 403 });
  }
  expect(db.bookingWidgetStats.upsert).not.toHaveBeenCalled();
  await service.recordWidget(
    'widget',
    BookingChannelEvent.VIEW,
    'https://example.com',
  );
  expect(db.bookingWidgetStats.upsert).toHaveBeenCalledOnce();
});

it('does no queries for empty lists', async () => {
  const { service, db, bookings } = fixture();
  expect(await service.forPages('location', [])).toEqual(new Map());
  expect(await service.forWidgets('location', [])).toEqual(new Map());
  expect(db.bookingPageStats.findMany).not.toHaveBeenCalled();
  expect(db.bookingWidgetStats.findMany).not.toHaveBeenCalled();
  expect(bookings.countCreatedByChannels).not.toHaveBeenCalled();
});
