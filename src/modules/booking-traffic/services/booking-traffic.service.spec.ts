import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { BookingChannelEvent } from '../../booking-channels/enums/booking-channel-event.enum.js';
import { BookingTrafficService } from './booking-traffic.service.js';

function setup(domain: string | undefined = 'https://www.klendo.ru') {
  const db = {
    $executeRaw: vi.fn(),
    bookingTrafficStat: { groupBy: vi.fn(), deleteMany: vi.fn() },
  };
  const config = { get: vi.fn().mockReturnValue({ domain }) };
  return {
    db,
    service: new BookingTrafficService(db as never, config as never),
  };
}

/** The bound values of a tagged $executeRaw call. */
function boundValues(call: unknown[]): unknown[] {
  return call.slice(1);
}

describe('BookingTrafficService', () => {
  describe('classify', () => {
    it.each(['klendo.ru', 'app.klendo.ru', 'https://www.klendo.ru/b/salon'])(
      'treats our own host %s as no referrer',
      (referrerHost) => {
        expect(setup().service.classify({ referrerHost })).toEqual({
          source: TrafficSource.DIRECT,
          detail: null,
          touch: null,
        });
      },
    );

    it('classifies an external referrer', () => {
      expect(
        setup().service.classify({ referrerHost: 'vk.com' }),
      ).toMatchObject({ source: TrafficSource.VK });
    });

    it('works without a configured domain', () => {
      expect(
        setup('').service.classify({ referrerHost: 'klendo.ru' }),
      ).toMatchObject({ source: TrafficSource.WEBSITE, detail: 'klendo.ru' });
    });

    it('is DIRECT without a touch', () => {
      expect(setup().service.classify(undefined).source).toBe(
        TrafficSource.DIRECT,
      );
    });
  });

  describe('recordChannelEvent', () => {
    it.each([
      [BookingChannelEvent.VIEW, 1, 0],
      [BookingChannelEvent.FORM_OPEN, 0, 1],
    ])(
      'adds a %s to the counter of the current UTC hour',
      async (event, views, formOpens) => {
        const { db, service } = setup();
        await service.recordChannelEvent(
          {
            locationId: 'loc-1',
            channel: 'WIDGET',
            channelId: 'widget-1',
            event,
            source: TrafficSource.INSTAGRAM,
          },
          new Date('2026-11-20T10:47:12.345Z'),
        );

        const call = db.$executeRaw.mock.calls[0];
        expect(String((call[0] as TemplateStringsArray).join('?'))).toContain(
          'ON CONFLICT ("locationId", "hourStart", "channelId", "source") DO UPDATE',
        );
        expect(boundValues(call)).toEqual([
          'loc-1',
          new Date('2026-11-20T10:00:00.000Z'),
          'WIDGET',
          'widget-1',
          TrafficSource.INSTAGRAM,
          views,
          formOpens,
        ]);
      },
    );
  });

  it('sums views and form opens per source over hours in the range', async () => {
    const { db, service } = setup();
    db.bookingTrafficStat.groupBy.mockResolvedValue([
      { source: 'VK', _sum: { views: 5, formOpens: 2 } },
      { source: 'DIRECT', _sum: { views: null, formOpens: null } },
    ]);
    const from = new Date('2026-10-31T21:00:00.000Z');
    const to = new Date('2026-11-30T21:00:00.000Z');

    await expect(service.trafficBySource('loc-1', from, to)).resolves.toEqual([
      { source: 'VK', views: 5, formOpens: 2 },
      { source: 'DIRECT', views: 0, formOpens: 0 },
    ]);
    expect(db.bookingTrafficStat.groupBy).toHaveBeenCalledWith({
      by: ['source'],
      where: { locationId: 'loc-1', hourStart: { gte: from, lt: to } },
      _sum: { views: true, formOpens: true },
    });
  });

  it('purges counters older than 25 months', async () => {
    const { db, service } = setup();
    db.bookingTrafficStat.deleteMany.mockResolvedValue({ count: 3 });

    await expect(
      service.purgeExpiredStats(new Date('2026-11-01T04:40:00.000Z')),
    ).resolves.toBe(3);
    expect(db.bookingTrafficStat.deleteMany).toHaveBeenCalledWith({
      where: { hourStart: { lt: new Date('2024-10-01T04:40:00.000Z') } },
    });
  });
});
