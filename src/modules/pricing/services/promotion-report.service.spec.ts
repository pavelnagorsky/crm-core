import { Prisma } from '@prisma/client';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { PromotionReportPeriod } from '../enums/promotion-report-period.enum.js';
import { PromotionReportService } from './promotion-report.service.js';

// 13:00 on 2026-11-26 in Minsk (UTC+3, no daylight saving).
const NOW = new Date('2026-11-26T10:00:00.000Z');
const d = (value: string) => new Prisma.Decimal(value);

describe('PromotionReportService', () => {
  const locations = {
    getLocale: vi
      .fn()
      .mockResolvedValue({ timezone: 'Europe/Minsk', currency: 'BYN' }),
  };
  const bookings = { getPromotionReport: vi.fn() };
  const productStats = { fullReport: vi.fn() };
  const service = new PromotionReportService(
    bookings as never,
    productStats as never,
    new DashboardRangeService(locations as never),
    locations as never,
  );
  const rule = { id: 'rule', createdAt: new Date('2026-11-20T22:30:00.000Z') };

  const full = (revenue: string, returnedRate: number | null) => ({
    revenue: d(revenue),
    discount: d('10.00'),
    bookingsCount: 4,
    salesCount: 2,
    clientsCount: 5,
    returnedRate,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    bookings.getPromotionReport.mockImplementation(
      (_location: string, _rule: string, since: Date | null) =>
        Promise.resolve({ since }),
    );
    productStats.fullReport.mockResolvedValue(full('100.00', 0.5));
  });

  it('30d: the last 30 days of the location as LAST_30D, with the previous 30 days', async () => {
    productStats.fullReport
      .mockResolvedValueOnce(full('300.00', 0.4))
      .mockResolvedValueOnce(full('200.00', 0.25));

    const report = await service.build(
      'location',
      rule,
      PromotionReportPeriod.DAYS_30,
      NOW,
    );

    expect(report.period).toEqual({ from: '2026-10-28', to: '2026-11-26' });
    expect(report.revenue.toFixed(2)).toBe('300.00');
    // [start of 2026-10-28, now] and the 30 days before it, up to the last millisecond.
    expect(bookings.getPromotionReport).toHaveBeenNthCalledWith(
      1,
      'location',
      'rule',
      new Date('2026-10-27T21:00:00.000Z'),
      NOW,
    );
    expect(bookings.getPromotionReport).toHaveBeenNthCalledWith(
      2,
      'location',
      'rule',
      new Date('2026-09-27T21:00:00.000Z'),
      new Date('2026-10-27T20:59:59.999Z'),
    );
    expect(report.previous).toEqual({
      revenue: d('200.00'),
      discount: d('10.00'),
      bookingsCount: 4,
      salesCount: 2,
      clientsCount: 5,
      returnedRate: 0.25,
    });
  });

  it('90d: from today minus 89 days to today, the previous window is 90 days', async () => {
    const report = await service.build(
      'location',
      rule,
      PromotionReportPeriod.DAYS_90,
      NOW,
    );

    expect(report.period).toEqual({ from: '2026-08-29', to: '2026-11-26' });
    expect(bookings.getPromotionReport).toHaveBeenNthCalledWith(
      1,
      'location',
      'rule',
      new Date('2026-08-28T21:00:00.000Z'),
      NOW,
    );
    expect(bookings.getPromotionReport).toHaveBeenNthCalledWith(
      2,
      'location',
      'rule',
      new Date('2026-05-30T21:00:00.000Z'),
      new Date('2026-08-28T20:59:59.999Z'),
    );
    expect(report.previous).not.toBeNull();
  });

  it('all: from the day the rule was created in the location timezone, no previous period', async () => {
    const report = await service.build(
      'location',
      rule,
      PromotionReportPeriod.ALL,
      NOW,
    );

    // 22:30 UTC on the 20th is 01:30 on the 21st in Minsk.
    expect(report.period).toEqual({ from: '2026-11-21', to: '2026-11-26' });
    expect(bookings.getPromotionReport).toHaveBeenCalledTimes(1);
    expect(bookings.getPromotionReport).toHaveBeenCalledWith(
      'location',
      'rule',
      new Date('2026-11-20T21:00:00.000Z'),
      NOW,
    );
    expect(report.previous).toBeNull();
  });

  it('all: a rule created today covers today', async () => {
    const report = await service.build(
      'location',
      { id: 'rule', createdAt: new Date('2026-11-26T08:00:00.000Z') },
      PromotionReportPeriod.ALL,
      NOW,
    );

    expect(report.period).toEqual({ from: '2026-11-26', to: '2026-11-26' });
  });

  it('keeps the report of the page: staff, products and the visit figures', async () => {
    productStats.fullReport.mockResolvedValue({
      ...full('100.00', 0.5),
      staff: [],
      products: [],
    });

    const report = await service.build(
      'location',
      rule,
      PromotionReportPeriod.ALL,
      NOW,
    );

    expect(report).toMatchObject({ staff: [], products: [], bookingsCount: 4 });
  });
});
