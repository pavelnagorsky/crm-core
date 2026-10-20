import { BadRequestException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service.js';
import { DashboardRangeDto } from '../dto/dashboard-range.dto.js';
import { DashboardPeriod } from '../enums/dashboard-period.enum.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { DashboardRangeService } from './dashboard-range.service.js';

function service(): DashboardRangeService {
  const businessService = {
    getLocale: vi.fn().mockResolvedValue({ timezone: 'UTC', currency: 'USD' }),
  } as unknown as LocationService;
  return new DashboardRangeService(businessService);
}

function range(
  partial: Partial<DashboardRangeDto> & Pick<DashboardRangeDto, 'period'>,
): DashboardRangeDto {
  return partial as DashboardRangeDto;
}

describe('DashboardRangeService granularity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buckets a year-to-date period by month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.YTD }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.MONTH);
  });

  it('keeps year-to-date monthly at the start of the year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.YTD }),
    );

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

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_3M }),
    );

    expect(resolved.granularity).toBe(SeriesGranularity.WEEK);
  });

  it('buckets periods longer than a quarter by month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const sixMonths = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_6M }),
    );
    const year = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_1Y }),
    );

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

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_3M }),
    );

    expect(resolved.from.toISOString()).toBe('2026-06-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('covers the six calendar months ending with today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_6M }),
    );

    expect(resolved.from.toISOString()).toBe('2026-03-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('covers the twelve calendar months ending with today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_1Y }),
    );

    expect(resolved.from.toISOString()).toBe('2025-09-27T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('clamps the start date when the month N months back is shorter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_3M }),
    );

    expect(resolved.from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(resolved.to.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('compares against the immediately preceding window of the same length', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T15:00:00.000Z'));

    const resolved = await service().resolve(
      'biz',
      range({ period: DashboardPeriod.LAST_3M }),
    );

    expect(resolved.previousTo.toISOString()).toBe(resolved.from.toISOString());
    expect(resolved.to.getTime() - resolved.from.getTime()).toBe(
      resolved.previousTo.getTime() - resolved.previousFrom.getTime(),
    );
  });
});

describe('DashboardRangeService brand scope', () => {
  const mixedLocations = {
    listByBrand: vi.fn().mockResolvedValue([
      { id: 'location-1', timezone: 'Europe/Minsk', currency: 'BYN' },
      { id: 'location-2', timezone: 'Europe/Warsaw', currency: 'PLN' },
    ]),
  } as unknown as LocationService;

  it('checks locale compatibility only within selected locations', async () => {
    const resolved = await new DashboardRangeService(
      mixedLocations,
    ).resolveForBrand('brand-1', range({ period: DashboardPeriod.LAST_7D }), [
      'location-2',
    ]);
    expect(resolved.locationIds).toEqual(['location-2']);
    expect(resolved.currency).toBe('PLN');
    expect(resolved.timezone).toBe('Europe/Warsaw');
  });

  it.each([
    { locationIds: [] },
    { locationIds: ['foreign-location'] },
    { locationIds: ['location-1', 'foreign-location'] },
  ])(
    'rejects empty or unavailable selections: $locationIds',
    async ({ locationIds }) => {
      await expect(
        new DashboardRangeService(mixedLocations).resolveForBrand(
          'brand-1',
          range({ period: DashboardPeriod.LAST_7D }),
          locationIds,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('does not combine currencies even with an explicit reporting timezone', async () => {
    await expect(
      new DashboardRangeService(mixedLocations).resolveForBrand(
        'brand-1',
        range({ period: DashboardPeriod.LAST_7D, timezone: 'UTC' }),
      ),
    ).rejects.toMatchObject({ errorCode: 'ANALYTICS_MIXED_LOCATION_LOCALES' });
  });

  it('rejects a brand without active locations', async () => {
    const locations = {
      listByBrand: vi.fn().mockResolvedValue([]),
    } as unknown as LocationService;
    await expect(
      new DashboardRangeService(locations).resolveForBrand(
        'brand-1',
        range({ period: DashboardPeriod.LAST_7D }),
      ),
    ).rejects.toMatchObject({ errorCode: 'ANALYTICS_BRAND_HAS_NO_LOCATIONS' });
  });

  it('returns all location ids when brand locales are compatible', async () => {
    const locationService = {
      listByBrand: vi.fn().mockResolvedValue([
        { id: 'location-1', timezone: 'Europe/Minsk', currency: 'BYN' },
        { id: 'location-2', timezone: 'Europe/Minsk', currency: 'BYN' },
      ]),
    } as unknown as LocationService;
    const resolved = await new DashboardRangeService(
      locationService,
    ).resolveForBrand('brand-1', range({ period: DashboardPeriod.LAST_7D }));

    expect(resolved.locationIds).toEqual(['location-1', 'location-2']);
    expect(resolved.timezone).toBe('Europe/Minsk');
    expect(resolved.currency).toBe('BYN');
  });

  it('requires an explicit timezone for a multi-timezone brand', async () => {
    const locationService = {
      listByBrand: vi.fn().mockResolvedValue([
        { id: 'location-1', timezone: 'Europe/Minsk', currency: 'USD' },
        { id: 'location-2', timezone: 'Europe/Warsaw', currency: 'USD' },
      ]),
    } as unknown as LocationService;
    const dashboardRange = new DashboardRangeService(locationService);

    await expect(
      dashboardRange.resolveForBrand(
        'brand-1',
        range({ period: DashboardPeriod.LAST_7D }),
      ),
    ).rejects.toMatchObject({
      errorCode: 'ANALYTICS_MIXED_LOCATION_LOCALES',
    });

    const resolved = await dashboardRange.resolveForBrand(
      'brand-1',
      range({
        period: DashboardPeriod.LAST_7D,
        timezone: 'UTC',
      }),
    );
    expect(resolved.timezone).toBe('UTC');
  });
});
