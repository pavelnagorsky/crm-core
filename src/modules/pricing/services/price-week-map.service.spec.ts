import {
  pricingSnapshot,
  priceLevel,
  pricingStaff,
  surchargeRule,
  weekdays,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceWeekMapService } from './price-week-map.service.js';

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

describe('PriceWeekMapService', () => {
  const snapshots = { load: vi.fn() };
  const staff = { resolveStaffForService: vi.fn(), listShiftsForStaff: vi.fn() };
  const service = new PriceWeekMapService(snapshots as never, staff as never);
  // Monday 30 November 2026.
  const query = { serviceId: 'cut', weekStart: '2026-11-30' };

  beforeEach(() => {
    vi.resetAllMocks();
    snapshots.load.mockResolvedValue(
      pricingSnapshot({
        services: { cut: 6000 },
        levels: [priceLevel('std', 'Standard', true), priceLevel('top', 'Top')],
        levelPrices: { cut: { top: 8000 } },
        staff: [pricingStaff('anna', null, { cut: 7000 })],
        rules: [
          surchargeRule('evening', {
            name: 'Evening',
            weekdaysMask: weekdays(5),
            intervals: [{ start: 1020, end: 1260 }],
          }),
        ],
        roundingStep: 1,
      }),
    );
    staff.resolveStaffForService.mockResolvedValue([{ id: 'anna' }]);
    staff.listShiftsForStaff.mockResolvedValue([]);
  });

  it('prices 7 days at the base level and cuts the day at the rule interval', async () => {
    const map = await service.weekMap('location', query);
    expect(map.days.map((day) => day.date)).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
    expect(map.days[0].segments).toEqual([
      { start: 0, end: 1440, price: 6000, staffPrice: 6000, adjustments: [] },
    ]);
    const friday = map.days[4].segments;
    expect(friday.map((s) => [s.start, s.end, s.price])).toEqual([
      [0, 1020, 6000],
      [1020, 1260, 6600],
      [1260, 1440, 6000],
    ]);
    expect(friday[1].adjustments).toEqual([
      { ruleId: 'evening', title: 'Evening', amount: 600 },
    ]);
  });

  it('prices a level as a staff member of that level without personal prices', async () => {
    const map = await service.weekMap('location', {
      ...query,
      levelId: 'top',
    });
    expect(map.days[0].segments[0]).toMatchObject({
      price: 8000,
      staffPrice: 8000,
    });
    expect(map.days[4].segments[1].price).toBe(8800);
  });

  it('prices a staff member by their personal price', async () => {
    const map = await service.weekMap('location', { ...query, staffId: 'anna' });
    expect(map.days[0].segments[0].price).toBe(7000);
  });

  it('rejects an unknown level, staff member or service, and both scopes at once', async () => {
    await expect(
      service.weekMap('location', { ...query, levelId: 'nope' }),
    ).rejects.toMatchObject({ errorCode: 'PRICE_LEVEL_NOT_FOUND' });
    await expect(
      service.weekMap('location', { ...query, staffId: 'nope' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_NOT_FOUND' });
    await expect(
      service.weekMap('location', { ...query, serviceId: 'nope' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SERVICE_NOT_FOUND' });
    await expect(
      service.weekMap('location', { ...query, staffId: 'anna', levelId: 'top' }),
    ).rejects.toBeDefined();
  });

  it('takes the hours from the shifts of the staff who do the service', async () => {
    staff.listShiftsForStaff.mockResolvedValue([
      { startTime: time('10:30'), endTime: time('18:00') },
      { startTime: time('12:00'), endTime: time('20:15') },
    ]);
    expect((await service.weekMap('location', query)).hours).toEqual({
      from: 10,
      to: 21,
    });
  });

  it('shows 9 to 21 when nobody has a shift that week', async () => {
    expect((await service.weekMap('location', query)).hours).toEqual({
      from: 9,
      to: 21,
    });
  });
});
