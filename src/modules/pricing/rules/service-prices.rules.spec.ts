import { Prisma, StaffStatus } from '@prisma/client';
import {
  buildServicePricesView,
  buildStaffServicePricesView,
  resolveStaffPrice,
} from './service-prices.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

const level = (id: string, name: string, isDefault = false) => ({
  id,
  locationId: 'location',
  name,
  sortOrder: 0,
  isDefault,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const member = (
  id: string,
  priceLevelId: string | null,
  personalPrice: string | null,
  status: StaffStatus = StaffStatus.ACTIVE,
) => ({
  staff: {
    id,
    name: `Staff ${id}`,
    priceLevelId,
    status,
    avatarFile: null,
  } as never,
  personalPrice: personalPrice === null ? null : d(personalPrice),
});

describe('service price rules', () => {
  it('prefers the personal price, then the level price, then the base price', () => {
    expect(resolveStaffPrice(d('50'), d('70'), d('90')).toFixed(2)).toBe(
      '90.00',
    );
    expect(resolveStaffPrice(d('50'), d('70'), null).toFixed(2)).toBe('70.00');
    expect(resolveStaffPrice(d('50'), undefined, null).toFixed(2)).toBe(
      '50.00',
    );
  });

  describe('service prices', () => {
    const levels = [
      level('std', 'Standard', true),
      level('top', 'Top'),
      level('empty', 'Without price'),
    ];
    const input = {
      serviceId: 'cut',
      basePrice: d('50'),
      levels,
      levelPrices: [{ serviceId: 'cut', priceLevelId: 'top', price: d('80') }],
      staffRows: [
        member('a', null, null),
        member('b', 'top', null),
        member('c', 'top', '95'),
        member('d', 'empty', null),
        member('e', 'top', '200', StaffStatus.INACTIVE),
      ],
      staffCounts: new Map<string | null, number>([
        [null, 2],
        ['top', 3],
      ]),
    };

    it('lists levels with their own price and staff counts', () => {
      const view = buildServicePricesView(input);
      expect(
        view.levels.map(({ levelId, price, staffCount }) => [
          levelId,
          price?.toFixed(2) ?? null,
          staffCount,
        ]),
      ).toEqual([
        ['std', null, 2],
        ['top', '80.00', 3],
        ['empty', null, 0],
      ]);
    });

    it('resolves the level, level price and total of every staff member', () => {
      const view = buildServicePricesView(input);
      expect(
        view.staff.map((row) => [
          row.staffId,
          row.levelId,
          row.levelName,
          row.levelPrice.toFixed(2),
          row.personalPrice?.toFixed(2) ?? null,
          row.price.toFixed(2),
        ]),
      ).toEqual([
        ['a', null, 'Standard', '50.00', null, '50.00'],
        ['b', 'top', 'Top', '80.00', null, '80.00'],
        ['c', 'top', 'Top', '80.00', '95.00', '95.00'],
        ['d', 'empty', 'Without price', '50.00', null, '50.00'],
        ['e', 'top', 'Top', '80.00', '200.00', '200.00'],
      ]);
    });

    it('takes the price range over active staff only', () => {
      const view = buildServicePricesView(input);
      expect(view.priceFrom.toFixed(2)).toBe('50.00');
      expect(view.priceTo.toFixed(2)).toBe('95.00');
    });

    it('uses the base price as the range and no level name without staff and levels', () => {
      const view = buildServicePricesView({
        ...input,
        levels: [],
        levelPrices: [],
        staffRows: [member('a', null, null)],
        staffCounts: new Map(),
      });
      expect(view.priceFrom.toFixed(2)).toBe('50.00');
      expect(view.staff[0].levelName).toBeNull();
      const empty = buildServicePricesView({ ...input, staffRows: [] });
      expect([empty.priceFrom, empty.priceTo].map((p) => p.toFixed(2))).toEqual(
        ['50.00', '50.00'],
      );
    });
  });

  describe('staff service prices', () => {
    it('applies the level price and the personal price per service', () => {
      const view = buildStaffServicePricesView({
        staffId: 'a',
        levelId: 'top',
        services: [
          { id: 'cut', title: 'Cut', price: d('50') },
          { id: 'dye', title: 'Dye', price: d('100') },
          { id: 'wash', title: 'Wash', price: d('10') },
        ],
        levelPrices: [
          { serviceId: 'cut', priceLevelId: 'top', price: d('80') },
        ],
        personalPrices: new Map([['dye', d('120')]]),
      });
      expect(
        view.items.map((item) => [
          item.serviceId,
          item.basePrice.toFixed(2),
          item.levelPrice.toFixed(2),
          item.personalPrice?.toFixed(2) ?? null,
          item.price.toFixed(2),
        ]),
      ).toEqual([
        ['cut', '50.00', '80.00', null, '80.00'],
        ['dye', '100.00', '100.00', '120.00', '120.00'],
        ['wash', '10.00', '10.00', null, '10.00'],
      ]);
      expect(view.levelId).toBe('top');
    });
  });
});
