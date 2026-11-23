import { AnyStaffRule } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { CalendarSlotOffers } from '../../calendar/interfaces/calendar-slot-offers.interface.js';
import {
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  sumBundle,
  surchargeRule,
  weekdays,
} from '../../pricing/engine/testing/pricing-snapshot.factory.js';
import { createPricingFacadeStub } from '../../pricing/testing/pricing-facade.stub.js';
import { PriceScheduleType } from '../../pricing/engine/enums/price-schedule-type.enum.js';
import { PricingRuleEntry } from '../../pricing/engine/interfaces/pricing-rule-entry.interface.js';
import { PublicSlotPricingService } from './public-slot-pricing.service.js';

const DATE = '2026-11-10';

/** Cut 60 / color 90; anna base, boris top level (cut 80, color 120), carl personal cut 50. */
const snapshot = (rules: PricingRuleEntry[] = [], roundingStep?: number) =>
  pricingSnapshot({
    rules,
    roundingStep,
    services: { cut: 6000, color: 9000 },
    bundles: [sumBundle('sum'), fixedBundle('fixed', 12000)],
    levels: [priceLevel('base', 'Base', true), priceLevel('top', 'Top')],
    levelPrices: { cut: { top: 8000 }, color: { top: 12000 } },
    staff: [
      pricingStaff('anna'),
      pricingStaff('boris', 'top'),
      pricingStaff('carl', null, { cut: 5000 }),
    ],
  });

type Options = {
  rule?: AnyStaffRule;
  items?: CalendarSlotOffers['items'];
  executionMode?: string;
  days?: CalendarSlotOffers['days'];
  loads?: Record<string, Record<string, number>>;
  lastAssigned?: Record<string, number>;
  rules?: PricingRuleEntry[];
  roundingStep?: number;
};

const cutItems = [{ serviceId: 'cut', durationMinutes: 60 }];

function setup(options: Options = {}) {
  const offers: CalendarSlotOffers = {
    items: options.items ?? cutItems,
    executionMode: options.executionMode ?? 'SEQUENTIAL',
    days: options.days ?? [
      {
        date: DATE,
        slots: [{ time: '10:00', freeStaffIds: [['anna', 'boris', 'carl']] }],
      },
    ],
  };
  const calendar = { getPublicSlotOffers: vi.fn(async () => offers) };
  const pricing = createPricingFacadeStub(
    snapshot(options.rules, options.roundingStep),
  );
  const priceBook = vi.spyOn(pricing, 'priceBook');
  const locations = {
    getBookingSettings: vi.fn(async () => ({
      timezone: 'UTC',
      anyStaffRule: options.rule ?? AnyStaffRule.CHEAPER_AND_FREER,
    })),
  };
  const staffLoad = {
    dayLoads: vi.fn(
      async () =>
        new Map(
          Object.entries(options.loads ?? {}).map(([staffId, byDate]) => [
            staffId,
            new Map(Object.entries(byDate)),
          ]),
        ),
    ),
    lastAssignedAt: vi.fn(
      async () => new Map(Object.entries(options.lastAssigned ?? {})),
    ),
  };
  const service = new PublicSlotPricingService(
    calendar as never,
    pricing,
    locations as never,
    staffLoad as never,
  );
  return { service, calendar, priceBook, staffLoad };
}

const slotOf = async (options: Options, dto: object = { serviceId: 'cut' }) => {
  const { service } = setup(options);
  const [day] = await service.getSlots('location-1', dto as never);
  return { date: day.date, slot: day.slots[0] };
};

describe('PublicSlotPricingService', () => {
  describe('"any staff" rule', () => {
    it.each([
      // Cheapest wins: Carl's personal price 50.
      [AnyStaffRule.CHEAPER_AND_FREER, 'carl', '50.00'],
      // Most expensive wins: Boris's level price 80.
      [AnyStaffRule.PRICIER, 'boris', '80.00'],
    ])('%s assigns %s at %s', async (rule, staffId, price) => {
      const { slot } = await slotOf({ rule });
      expect(slot.staffIds).toEqual([staffId]);
      expect(slot.price.toFixed(2)).toBe(price);
    });

    it('LESS_LOADED prefers the least loaded staff member and prices them', async () => {
      const { slot } = await slotOf({
        rule: AnyStaffRule.LESS_LOADED,
        loads: {
          anna: { [DATE]: 3 },
          boris: { [DATE]: 1 },
          carl: { [DATE]: 2 },
        },
      });
      expect(slot.staffIds).toEqual(['boris']);
      expect(slot.price.toFixed(2)).toBe('80.00');
    });

    it('uses the load of the slot day, not of other days', async () => {
      const { slot } = await slotOf({
        rule: AnyStaffRule.LESS_LOADED,
        loads: { anna: { '2026-11-11': 9 }, boris: { [DATE]: 1 } },
      });
      // Anna and Carl have no load on the day; Anna wins on price then id.
      expect(slot.staffIds).toEqual(['carl']);
    });

    it('ROUND_ROBIN prefers who has waited longest, never-assigned first', async () => {
      const { slot } = await slotOf({
        rule: AnyStaffRule.ROUND_ROBIN,
        lastAssigned: { anna: 1000, boris: 500 },
      });
      // Carl never got a booking.
      expect(slot.staffIds).toEqual(['carl']);

      const next = await slotOf({
        rule: AnyStaffRule.ROUND_ROBIN,
        lastAssigned: { anna: 1000, boris: 500, carl: 2000 },
      });
      expect(next.slot.staffIds).toEqual(['boris']);
      expect(next.slot.price.toFixed(2)).toBe('80.00');
    });

    it('changing the rule changes both the price and the staff of the same slot', async () => {
      const cheaper = await slotOf({ rule: AnyStaffRule.CHEAPER_AND_FREER });
      const pricier = await slotOf({ rule: AnyStaffRule.PRICIER });
      expect(cheaper.slot).not.toEqual(pricier.slot);
      expect(cheaper.slot.price.lt(pricier.slot.price)).toBe(true);
    });
  });

  it('serves a chosen staff member through the calendar: one candidate, their price', async () => {
    const { slot } = await slotOf(
      {
        rule: AnyStaffRule.CHEAPER_AND_FREER,
        days: [
          {
            date: DATE,
            slots: [{ time: '10:00', freeStaffIds: [['boris']] }],
          },
        ],
      },
      { serviceId: 'cut', staffId: 'boris' },
    );
    expect(slot).toMatchObject({ time: '10:00', staffIds: ['boris'] });
    expect(slot.price.toFixed(2)).toBe('80.00');
  });

  describe('several services', () => {
    const items = [
      { serviceId: 'cut', durationMinutes: 60 },
      { serviceId: 'color', durationMinutes: 60 },
    ];

    it('sums the price of each item with the staff assigned to it', async () => {
      const { slot } = await slotOf(
        {
          items,
          days: [
            {
              date: DATE,
              slots: [
                {
                  time: '10:00',
                  // Carl does the cut (50), Anna or Boris the color: Anna is cheaper (90).
                  freeStaffIds: [['carl'], ['anna', 'boris']],
                },
              ],
            },
          ],
        },
        { serviceIds: ['cut', 'color'] },
      );
      expect(slot.staffIds).toEqual(['carl', 'anna']);
      expect(slot.price.toFixed(2)).toBe('140.00');
    });

    it('assigns distinct staff to a parallel visit', async () => {
      const { slot } = await slotOf(
        {
          items,
          executionMode: 'PARALLEL',
          rule: AnyStaffRule.CHEAPER_AND_FREER,
          days: [
            {
              date: DATE,
              slots: [
                {
                  time: '10:00',
                  freeStaffIds: [
                    ['anna', 'boris'],
                    ['anna', 'boris'],
                  ],
                },
              ],
            },
          ],
        },
        { bundleId: 'sum' },
      );
      expect(new Set(slot.staffIds).size).toBe(2);
      // Anna (60 + 90 = 150 as a pair) and Boris (80 + 120): whoever takes which item.
      expect(slot.staffIds).toEqual(['anna', 'boris']);
    });

    it('prices a FIXED bundle as the package whoever takes it', async () => {
      const { slot } = await slotOf(
        {
          items,
          rule: AnyStaffRule.PRICIER,
          days: [
            {
              date: DATE,
              slots: [
                {
                  time: '10:00',
                  freeStaffIds: [
                    ['anna', 'boris'],
                    ['anna', 'boris'],
                  ],
                },
              ],
            },
          ],
        },
        { bundleId: 'fixed' },
      );
      expect(slot.price.toFixed(2)).toBe('120.00');
    });
  });

  it('keeps the days and the slot order of the calendar', async () => {
    const { service } = setup({
      days: [
        {
          date: '2026-11-10',
          slots: [
            { time: '10:00', freeStaffIds: [['anna']] },
            { time: '10:30', freeStaffIds: [['boris']] },
          ],
        },
        {
          date: '2026-11-12',
          slots: [{ time: '09:00', freeStaffIds: [['carl']] }],
        },
      ],
    });

    const days = await service.getSlots('location-1', {
      serviceId: 'cut',
    } as never);

    expect(
      days.map((day) => [
        day.date,
        day.slots.map((slot) => [
          slot.time,
          slot.staffIds,
          slot.price.toFixed(2),
        ]),
      ]),
    ).toEqual([
      [
        '2026-11-10',
        [
          ['10:00', ['anna'], '60.00'],
          ['10:30', ['boris'], '80.00'],
        ],
      ],
      ['2026-11-12', [['09:00', ['carl'], '50.00']]],
    ]);
  });

  describe('reads', () => {
    const manySlots = Array.from({ length: 40 }, (_, index) => ({
      time: `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
      freeStaffIds: [['anna', 'boris', 'carl']],
    }));
    const days = [
      { date: '2026-11-10', slots: manySlots },
      { date: '2026-11-11', slots: manySlots },
    ];

    it('does one price book, one calendar read and one day-load read whatever the slot count', async () => {
      const { service, calendar, priceBook, staffLoad } = setup({ days });

      await service.getSlots('location-1', { serviceId: 'cut' } as never);

      expect(priceBook).toHaveBeenCalledTimes(1);
      expect(priceBook).toHaveBeenCalledWith(
        'location-1',
        ReadConsistency.CACHED,
      );
      expect(calendar.getPublicSlotOffers).toHaveBeenCalledTimes(1);
      expect(staffLoad.dayLoads).toHaveBeenCalledTimes(1);
      expect(staffLoad.dayLoads).toHaveBeenCalledWith(
        'location-1',
        ['anna', 'boris', 'carl'],
        '2026-11-10',
        '2026-11-11',
        'UTC',
      );
      // Only ROUND_ROBIN reads the last assignments.
      expect(staffLoad.lastAssignedAt).not.toHaveBeenCalled();
    });

    it('reads the last assignments once for ROUND_ROBIN', async () => {
      const { service, staffLoad } = setup({
        days,
        rule: AnyStaffRule.ROUND_ROBIN,
      });

      await service.getSlots('location-1', { serviceId: 'cut' } as never);

      expect(staffLoad.lastAssignedAt).toHaveBeenCalledTimes(1);
    });

    it('loads nothing when the calendar offers no slots', async () => {
      const { service, staffLoad } = setup({ days: [] });

      await expect(
        service.getSlots('location-1', { serviceId: 'cut' } as never),
      ).resolves.toEqual([]);
      expect(staffLoad.dayLoads).not.toHaveBeenCalled();
    });
  });

  it('rejects a selection the price book does not hold', async () => {
    const { service } = setup({
      items: [{ serviceId: 'unknown', durationMinutes: 30 }],
    });

    await expect(
      service.getSlots('location-1', { serviceId: 'unknown' } as never),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SERVICE_NOT_FOUND' });
  });

  describe('surcharges by the slot start', () => {
    const FRIDAY = '2026-11-27';
    /** +20% on Friday from 17:00. */
    const fridayEvening = surchargeRule('friday', {
      value: 2000,
      weekdaysMask: weekdays(5),
      intervals: [{ start: 17 * 60, end: 24 * 60 }],
    });
    const fridaySlots = (times: string[]) => [
      {
        date: FRIDAY,
        slots: times.map((time) => ({
          time,
          freeStaffIds: [['anna', 'boris', 'carl']],
        })),
      },
    ];

    it('prices a Friday 17:00 slot at 60 and a 16:00 slot at 50', async () => {
      const { service } = setup({
        rules: [fridayEvening],
        days: fridaySlots(['16:00', '17:00']),
      });
      const [day] = await service.getSlots('location-1', {
        serviceId: 'cut',
      } as never);
      expect(
        day.slots.map((slot) => [slot.time, slot.price.toFixed(2)]),
      ).toEqual([
        ['16:00', '50.00'],
        ['17:00', '60.00'],
      ]);
      // Surcharges reach every candidate alike: ranking stays by staff price.
      expect(day.slots.map((slot) => slot.staffIds)).toEqual([
        ['carl'],
        ['carl'],
      ]);
    });

    it('leaves other days without the surcharge', async () => {
      const { slot } = await slotOf({
        rules: [fridayEvening],
        days: [
          {
            date: '2026-11-26',
            slots: [
              { time: '18:00', freeStaffIds: [['anna', 'boris', 'carl']] },
            ],
          },
        ],
      });
      expect(slot.price.toFixed(2)).toBe('50.00');
    });

    it('applies only the exclusive holiday rule on its date', async () => {
      const holiday = surchargeRule('holiday', {
        scheduleType: PriceScheduleType.HOLIDAYS,
        value: 1000,
        dates: [FRIDAY],
        holidayExclusive: true,
      });
      const { slot } = await slotOf({
        rules: [fridayEvening, holiday],
        days: fridaySlots(['18:00']),
      });
      // Carl 50 + 10% holiday only, the Friday evening rule is overridden.
      expect(slot.price.toFixed(2)).toBe('55.00');
    });

    it('rounds a surcharged slot price to the location step', async () => {
      const { slot } = await slotOf({
        rules: [surchargeRule('evening', { value: 1500 })],
        roundingStep: 500,
        days: fridaySlots(['10:00']),
      });
      // Carl 50 + 15% = 57.50, rounded to 60.00.
      expect(slot.price.toFixed(2)).toBe('60.00');
    });
  });
});
