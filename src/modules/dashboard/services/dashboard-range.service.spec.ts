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

  it('keeps a multi-month custom range weekly when it is shorter than a year', async () => {
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
