import { BusinessService } from '../../business/business.service.js';
import { DashboardRangeDto } from '../dto/dashboard-range.dto.js';
import { DashboardPeriod } from '../enums/dashboard-period.enum.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { DashboardRangeService } from './dashboard-range.service.js';

function service(): DashboardRangeService {
  const businessService = {
    getLocale: vi.fn().mockResolvedValue({ timezone: 'UTC', currency: 'USD' }),
  } as unknown as BusinessService;
  return new DashboardRangeService(businessService);
}

function range(partial: Partial<DashboardRangeDto> & Pick<DashboardRangeDto, 'period'>): DashboardRangeDto {
  return partial as DashboardRangeDto;
}

describe('DashboardRangeService granularity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buckets a year-to-date period by month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.YTD }));

    expect(resolved.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('keeps year-to-date monthly at the start of the year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.YTD }));

    expect(resolved.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('buckets a custom calendar year by month', async () => {
    const resolved = await service().resolve(
      'biz',
      range({
        period: DashboardPeriod.CUSTOM,
        from: '2025-01-01T00:00:00.000Z',
        to: '2025-12-31T00:00:00.000Z',
      }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('keeps a multi-month custom range weekly when it is no longer than a quarter', async () => {
    const resolved = await service().resolve(
      'biz',
      range({
        period: DashboardPeriod.CUSTOM,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.WEEK);
  });

  it('buckets a rolling quarter by week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_3M }));

    expect(resolved.granularity).toBe(SeriesGranularity.WEEK);
  });

  it('buckets periods longer than a quarter by month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const sixMonths = await service().resolve('biz', range({ period: DashboardPeriod.LAST_6M }));
    const year = await service().resolve('biz', range({ period: DashboardPeriod.LAST_1Y }));

    expect(sixMonths.granularity).toBe(SeriesGranularity.MONTH);
    expect(year.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('buckets a custom range just past a quarter by month', async () => {
    const resolved = await service().resolve(
      'biz',
      range({
        period: DashboardPeriod.CUSTOM,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-04-05T00:00:00.000Z',
      }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('lets an explicit groupBy override the year default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.YTD, groupBy: SeriesGranularity.WEEK }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.WEEK);
  });
});

describe('DashboardRangeService rolling month periods', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('covers the three calendar months ending with today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_3M }));

    expect(resolved.from.toISOString()).toBe('2026-06-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('covers the six calendar months ending with today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_6M }));

    expect(resolved.from.toISOString()).toBe('2026-03-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('covers the twelve calendar months ending with today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_1Y }));

    expect(resolved.from.toISOString()).toBe('2025-09-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('clamps the start date when the month N months back is shorter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_3M }));

    expect(resolved.from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('compares against the immediately preceding window of the same length', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve('biz', range({ period: DashboardPeriod.LAST_3M }));

    expect(resolved.previousTo.toISOString()).toBe(resolved.from.toISOString());
    expect(resolved.to.getTime() - resolved.from.getTime()).toBe(
      resolved.previousTo.getTime() - resolved.previousFrom.getTime(),
    );
  });
});
