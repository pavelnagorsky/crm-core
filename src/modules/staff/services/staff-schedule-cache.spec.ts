import { createTestCache } from '../../../shared/cache/testing/create-test-cache.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { StaffService } from './staff.service.js';

describe('Staff schedule cache coverage', () => {
  const day = (value: string) => new Date(value);
  const shift = (date: string, staffId = 'anna') => ({
    staffId,
    date: day(date),
    startTime: day('1970-01-01T09:00:00Z'),
    endTime: day('1970-01-01T18:00:00Z'),
  });
  let cache: AppCacheService;
  const findMany = vi.fn();
  let service: StaffService;
  const settings = {
    brandId: 'brand',
    timezone: 'Europe/Minsk',
    advanceBookingWindowDays: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    findMany
      .mockReset()
      .mockResolvedValue([shift('2026-10-27'), shift('2026-10-28', 'boris')]);
    cache = createTestCache();
    service = new StaffService(
      { staffShift: { findMany } } as never,
      {} as never,
      { getBookingSettings: async () => settings } as never,
      {} as never,
      {} as never,
      {} as never,
      cache,
    );
  });
  afterEach(async () => {
    await cache.onModuleDestroy();
    vi.useRealTimers();
  });

  it('reuses one snapshot for different dates and employees', async () => {
    await service.warmBookingSchedule('location');
    expect(
      await service.listShiftsForAvailability(
        'location',
        ['anna'],
        day('2026-10-27'),
        day('2026-10-27'),
      ),
    ).toEqual([shift('2026-10-27')]);
    expect(
      await service.listShiftsForAvailability(
        'location',
        ['boris'],
        day('2026-10-28'),
        day('2026-10-28'),
      ),
    ).toEqual([shift('2026-10-28', 'boris')]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('reads only the requested shifts when cache is disabled for profiling', async () => {
    await cache.onModuleDestroy();
    cache = createTestCache(false);
    service = new StaffService(
      { staffShift: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cache,
    );
    await service.listShiftsForAvailability(
      'location',
      ['anna'],
      day('2026-10-27'),
      day('2026-10-27'),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staffId: { in: ['anna'] },
          date: { gte: day('2026-10-27'), lte: day('2026-10-27') },
        }),
      }),
    );
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('reads outside coverage without adding keys or returning false empty results', async () => {
    await service.warmBookingSchedule('location');
    findMany.mockResolvedValueOnce([shift('2026-12-01')]);
    expect(
      await service.listShiftsForAvailability(
        'location',
        ['anna'],
        day('2026-12-01'),
        day('2026-12-01'),
      ),
    ).toEqual([shift('2026-12-01')]);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staffId: { in: ['anna'] },
          date: { gte: day('2026-12-01'), lte: day('2026-12-01') },
        }),
      }),
    );
  });

  it('includes the final covered day when a manual range ends at the end of day', async () => {
    findMany.mockResolvedValue([shift('2026-10-29')]);
    await service.warmBookingSchedule('location');
    expect(
      await service.listShiftsForAvailability(
        'location',
        ['anna'],
        day('2026-10-27'),
        day('2026-10-29T23:59:59.999Z'),
      ),
    ).toEqual([shift('2026-10-29')]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('moves the window at local midnight even while TTL is valid', async () => {
    vi.setSystemTime(new Date('2026-10-27T20:59:00Z'));
    await service.warmBookingSchedule('location');
    vi.setSystemTime(new Date('2026-10-27T21:01:00Z'));
    await service.warmBookingSchedule('location');
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: day('2026-10-28'), lte: day('2026-10-30') },
        }),
      }),
    );
  });

  it('caches all shifts in the booking window without a row limit', async () => {
    const shifts = Array.from({ length: 5001 }, () => shift('2026-10-27'));
    findMany.mockResolvedValue(shifts);
    await service.warmBookingSchedule('location');
    expect(
      await service.listShiftsForAvailability(
        'location',
        ['anna'],
        day('2026-10-27'),
        day('2026-10-27'),
      ),
    ).toEqual(shifts);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('covers the full configured booking window beyond 90 days', async () => {
    const previousWindow = settings.advanceBookingWindowDays;
    settings.advanceBookingWindowDays = 180;
    findMany.mockResolvedValue([shift('2027-02-01')]);
    try {
      await service.warmBookingSchedule('location');
      expect(
        await service.listShiftsForAvailability(
          'location',
          ['anna'],
          day('2027-02-01'),
          day('2027-02-01'),
        ),
      ).toEqual([shift('2027-02-01')]);
      expect(findMany).toHaveBeenCalledTimes(1);
    } finally {
      settings.advanceBookingWindowDays = previousWindow;
    }
  });

  it('reloads a replaced schedule without invalidating another location', async () => {
    await service.warmBookingSchedule('a');
    await service.warmBookingSchedule('b');
    await cache.invalidate(CacheDependency.staffSchedule('a'));
    findMany.mockResolvedValue([]);
    expect(
      await service.listShiftsForAvailability(
        'a',
        ['anna'],
        day('2026-10-27'),
        day('2026-10-27'),
      ),
    ).toEqual([]);
    expect(
      await service.listShiftsForAvailability(
        'b',
        ['anna'],
        day('2026-10-27'),
        day('2026-10-27'),
      ),
    ).toHaveLength(1);
    expect(findMany).toHaveBeenCalledTimes(3);
  });
});
