import { ServiceStatus } from '@prisma/client';
import { PriceTimeline } from '../engine/price-timeline.js';
import { PriceChangeTarget } from '../engine/enums/price-change-target.enum.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { PriceChangeFacts } from '../interfaces/price-change-facts.interface.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';
import {
  buildPriceChangeGroups,
  countPriceChangeRows,
  priceChangeAfter,
  selectPriceChangeScope,
} from './service-price-change-rows.rules.js';

const spec = (over: Partial<PriceChangeSpec> = {}): PriceChangeSpec => ({
  allServices: true,
  serviceIds: [],
  categoryIds: [],
  bundleIds: [],
  mode: PriceChangeMode.PERCENT,
  value: 1000,
  step: 1,
  include: { levelPrices: true, staffPrices: true, fixedBundles: true },
  effectiveDate: null,
  ...over,
});

const facts = (): PriceChangeFacts => ({
  categories: [
    { id: 'c2', name: 'Second', sortOrder: 2 },
    { id: 'c1', name: 'First', sortOrder: 1 },
  ],
  levels: [{ id: 'l1', name: 'Top', sortOrder: 1 }],
  services: [
    {
      id: 's1',
      title: 'Cut',
      categoryId: 'c1',
      status: ServiceStatus.ACTIVE,
      sortOrder: 0,
      price: 5000,
      levelPrices: { l1: 7000 },
      staff: [
        { staffId: 'st2', name: 'Zoe', price: 6000 },
        { staffId: 'st1', name: 'Ann', price: null },
      ],
    },
    {
      id: 's2',
      title: 'Free',
      categoryId: null,
      status: ServiceStatus.INACTIVE,
      sortOrder: 0,
      price: 0,
      levelPrices: {},
      staff: [],
    },
  ],
  bundles: [
    {
      id: 'b1',
      title: 'Set',
      categoryId: 'c1',
      status: ServiceStatus.ACTIVE,
      sortOrder: 0,
      price: 9000,
    },
  ],
});

const build = (s: PriceChangeSpec, timeline = new PriceTimeline([]), date = '2027-01-01') =>
  buildPriceChangeGroups(facts(), s, date, timeline);

describe('priceChangeAfter', () => {
  const base = PriceChangeTarget.BASE as never;
  it('adjusts by percent and amount and rounds to the step', () => {
    expect(
      priceChangeAfter(base, 4990, { mode: PriceChangeMode.PERCENT, value: 1500, step: 500 }),
    ).toEqual({ after: 5500, invalid: false });
    expect(
      priceChangeAfter(base, 5000, { mode: PriceChangeMode.AMOUNT, value: -500, step: 1 }),
    ).toEqual({ after: 4500, invalid: false });
  });

  it('keeps a free service free under a percent', () => {
    expect(
      priceChangeAfter(base, 0, { mode: PriceChangeMode.PERCENT, value: 1000, step: 1 }),
    ).toEqual({ after: 0, invalid: false });
  });

  it('marks zero from a positive price, and a price past the maximum, as invalid', () => {
    expect(
      priceChangeAfter(base, 1000, { mode: PriceChangeMode.AMOUNT, value: -2000, step: 1 }).invalid,
    ).toBe(true);
    expect(
      priceChangeAfter(base, 9_999_999_000, { mode: PriceChangeMode.PERCENT, value: 5000, step: 1 }).invalid,
    ).toBe(true);
  });

  it('SET gives base and bundle the value and leaves level and personal rows alone', () => {
    const set = { mode: PriceChangeMode.SET, value: 8000, step: 1 };
    expect(priceChangeAfter(base, 5000, set).after).toBe(8000);
    expect(priceChangeAfter('LEVEL' as never, 5000, set).after).toBe(5000);
    expect(
      priceChangeAfter(base, 5000, { ...set, value: null }).after,
    ).toBe(5000);
    expect(priceChangeAfter(base, 5000, { ...set, value: 0 }).invalid).toBe(true);
  });
});

describe('selectPriceChangeScope', () => {
  const catalog = {
    services: [
      { id: 's1', categoryId: 'c1' },
      { id: 's2', categoryId: 'c2' },
      { id: 's3', categoryId: null },
    ],
    bundles: [
      { id: 'b1', categoryId: 'c1', fixed: true },
      { id: 'b2', categoryId: 'c1', fixed: false },
      { id: 'b3', categoryId: null, fixed: true },
    ],
  };

  it('takes everything with allServices, only FIXED bundles', () => {
    expect(selectPriceChangeScope(catalog, spec())).toEqual({
      serviceIds: ['s1', 's2', 's3'],
      bundleIds: ['b1', 'b3'],
    });
  });

  it('takes categories with their FIXED bundles when asked', () => {
    const picked = spec({ allServices: false, categoryIds: ['c1'] });
    expect(selectPriceChangeScope(catalog, picked)).toEqual({
      serviceIds: ['s1'],
      bundleIds: ['b1'],
    });
    expect(
      selectPriceChangeScope(catalog, {
        ...picked,
        include: { ...picked.include, fixedBundles: false },
      }).bundleIds,
    ).toEqual([]);
  });

  it('always takes the bundles named in bundleIds', () => {
    const picked = spec({
      allServices: false,
      bundleIds: ['b3'],
      include: { levelPrices: true, staffPrices: true, fixedBundles: false },
    });
    expect(selectPriceChangeScope(catalog, picked).bundleIds).toEqual(['b3']);
  });
});

describe('buildPriceChangeGroups', () => {
  it('builds base, level, personal and bundle rows, ordered by category, services before bundles', () => {
    const groups = build(spec());
    expect(groups.map((g) => g.title)).toEqual(['Cut', 'Set', 'Free']);
    expect(groups[0].rows.map((r) => [r.key, r.before, r.after])).toEqual([
      ['BASE:s1', 5000, 5500],
      ['LEVEL:s1:l1', 7000, 7700],
      ['STAFF:s1:st2', 6000, 6600],
    ]);
    expect(groups[1].rows[0]).toMatchObject({ key: 'BUNDLE:b1', after: 9900 });
    expect(groups[2].categoryName).toBeNull();
    expect(groups[2].status).toBe(ServiceStatus.INACTIVE);
    expect(countPriceChangeRows(groups)).toEqual({
      services: 2,
      bundles: 1,
      rows: 5,
      changed: 4,
      invalid: 0,
    });
  });

  it('leaves out level and personal rows without their include flags', () => {
    const groups = build(
      spec({ include: { levelPrices: false, staffPrices: false, fixedBundles: false } }),
    );
    expect(groups.flatMap((g) => g.rows.map((r) => r.key))).toEqual([
      'BASE:s1',
      'BUNDLE:b1',
      'BASE:s2',
    ]);
  });

  it('computes chained percent changes from the price in effect on the date', () => {
    const timeline = new PriceTimeline([
      {
        id: 'c1',
        effectiveDate: '2027-01-01',
        items: [
          {
            target: PriceChangeTarget.BASE,
            serviceId: 's1',
            levelId: null,
            staffId: null,
            bundleId: null,
            productLocationId: null,
            price: 5500,
          },
        ],
      },
    ]);
    const base = (date: string) =>
      build(spec({ step: 100 }), timeline, date)[0].rows[0];
    expect(base('2027-01-02')).toMatchObject({ before: 5500, after: 6100 });
    expect(base('2026-12-31')).toMatchObject({ before: 5000, after: 5500 });
  });

  it('adds a personal or level row that an earlier change introduces, and drops a removed one', () => {
    const timeline = new PriceTimeline([
      {
        id: 'c1',
        effectiveDate: '2027-01-01',
        items: [
          {
            target: PriceChangeTarget.STAFF,
            serviceId: 's1',
            levelId: null,
            staffId: 'st1',
            bundleId: null,
            productLocationId: null,
            price: 4000,
          },
          {
            target: PriceChangeTarget.LEVEL,
            serviceId: 's1',
            levelId: 'l1',
            staffId: null,
            bundleId: null,
            productLocationId: null,
            price: null,
          },
        ],
      },
    ]);
    const keys = build(spec(), timeline, '2027-02-01')[0].rows.map((r) => r.key);
    expect(keys).toEqual(['BASE:s1', 'STAFF:s1:st1', 'STAFF:s1:st2']);
  });

  it('checks only valid rows that change the price', () => {
    const rows = build(spec({ mode: PriceChangeMode.AMOUNT, value: -5000 }))[0].rows;
    expect(rows[0]).toMatchObject({ after: 0, invalid: true, checked: false });
    expect(rows[1]).toMatchObject({ after: 2000, invalid: false, checked: true });
  });
});
