import { Prisma } from '@prisma/client';
import { SeriesGranularity } from '../../../dashboard/enums/series-granularity.enum.js';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';

describe('BookingsAggregatesService location scope', () => {
  const db = {
    $queryRaw: vi.fn(),
    booking: { groupBy: vi.fn().mockResolvedValue([]) },
  };
  const service = new BookingsAggregatesService(db as never, {} as never);
  const range = {
    locationIds: ['location-1', 'location-2'],
    from: new Date('2026-10-01T00:00:00.000Z'),
    to: new Date('2026-10-02T00:00:00.000Z'),
    granularity: SeriesGranularity.DAY,
    timezone: 'UTC',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([]);
  });

  it.each(['snapshot', 'series'] as const)(
    '%s queries all selected locations together',
    async (operation) => {
      if (operation === 'snapshot') await service.snapshot(range);
      else await service.series(range, false);
      const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(query.sql).toContain('b."locationId" IN (?,?)');
      expect(query.values).toContain('location-1');
      expect(query.values).toContain('location-2');
      expect(query.values).not.toContain(undefined);
    },
  );

  it('preserves a mandatory location filter in Prisma queries', async () => {
    await service.countBySource(range);
    expect(db.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: { in: range.locationIds },
        }),
      }),
    );
  });

  it('counts channel bookings once each, across all dates, statuses and soft deletions', async () => {
    await service.countCreatedByChannels('location-1', ['page'], ['widget']);
    expect(db.booking.groupBy).toHaveBeenCalledWith({
      by: ['bookingPageId', 'bookingWidgetId'],
      where: {
        locationId: 'location-1',
        location: expect.any(Object),
        OR: [
          { bookingPageId: { in: ['page'] } },
          { bookingWidgetId: { in: ['widget'] } },
        ],
      },
      _count: { _all: true },
    });
  });

  it('skips empty channel selections', async () => {
    expect(await service.countCreatedByChannels('location-1', [], [])).toEqual(
      [],
    );
    expect(db.booking.groupBy).not.toHaveBeenCalled();
  });

  it('never widens an empty selection to all bookings', async () => {
    await service.snapshot({ ...range, locationIds: [] });
    const query = db.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain('WHERE FALSE');
    expect(query.sql).not.toContain('IN ()');
    await service.countBySource({ ...range, locationIds: [] });
    expect(db.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locationId: { in: [] } }),
      }),
    );
  });
});
