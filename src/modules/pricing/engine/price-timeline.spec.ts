import { ServicePriceChangeTarget } from './enums/service-price-change-target.enum.js';
import { PricingPriceChangeEntry } from './interfaces/pricing-price-change-entry.interface.js';
import {
  PriceTimeline,
  baseKey,
  bundleKey,
  levelKey,
  staffKey,
} from './price-timeline.js';

const change = (
  id: string,
  effectiveDate: string,
  items: Partial<PricingPriceChangeEntry['items'][number]>[],
): PricingPriceChangeEntry => ({
  id,
  effectiveDate,
  items: items.map((item) => ({
    target: ServicePriceChangeTarget.BASE,
    serviceId: null,
    levelId: null,
    staffId: null,
    bundleId: null,
    price: 0,
    ...item,
  })),
});

const base = (serviceId: string, price: number | null) => ({
  target: ServicePriceChangeTarget.BASE,
  serviceId,
  price,
});

describe('PriceTimeline', () => {
  it('builds target keys', () => {
    expect(baseKey('s')).toBe('BASE:s');
    expect(levelKey('s', 'l')).toBe('LEVEL:s:l');
    expect(staffKey('s', 'st')).toBe('STAFF:s:st');
    expect(bundleKey('b')).toBe('BUNDLE:b');
  });

  it('returns the current value without changes', () => {
    const timeline = new PriceTimeline([]);
    expect(timeline.isEmpty).toBe(true);
    expect(timeline.resolve('BASE:cut', '2027-01-01', 6000)).toBe(6000);
  });

  it.each([
    ['the day before', '2026-12-31', 6000],
    ['the effective day', '2027-01-01', 6600],
    ['after', '2027-06-01', 6600],
  ])('one change: %s', (_name, date, expected) => {
    const timeline = new PriceTimeline([
      change('c1', '2027-01-01', [base('cut', 6600)]),
    ]);
    expect(timeline.resolve('BASE:cut', date, 6000)).toBe(expected);
    expect(timeline.resolve('BASE:color', date, 9000)).toBe(9000);
  });

  it.each([
    ['2026-12-31', 6000],
    ['2027-01-01', 6600],
    ['2027-01-31', 6600],
    ['2027-02-01', 7300],
    ['2027-03-01', 7300],
  ])('two changes on different dates (reverse input): %s', (date, expected) => {
    const timeline = new PriceTimeline([
      change('c2', '2027-02-01', [base('cut', 7300)]),
      change('c1', '2027-01-01', [base('cut', 6600)]),
    ]);
    expect(timeline.resolve('BASE:cut', date, 6000)).toBe(expected);
  });

  it('null drops a level price and a personal price', () => {
    const timeline = new PriceTimeline([
      change('c1', '2027-01-01', [
        {
          target: ServicePriceChangeTarget.LEVEL,
          serviceId: 'cut',
          levelId: 'senior',
          price: null,
        },
        {
          target: ServicePriceChangeTarget.STAFF,
          serviceId: 'cut',
          staffId: 'anna',
          price: null,
        },
      ]),
    ]);
    expect(timeline.resolve('LEVEL:cut:senior', '2027-01-01', 8000)).toBeNull();
    expect(timeline.resolve('LEVEL:cut:senior', '2026-12-31', 8000)).toBe(8000);
    expect(timeline.resolve('STAFF:cut:anna', '2027-01-01', 7000)).toBeNull();
  });

  it('skips rows whose target is gone', () => {
    const timeline = new PriceTimeline([
      change('c1', '2027-01-01', [
        base('cut', 1),
        { target: ServicePriceChangeTarget.BASE, serviceId: null, price: 2 },
        { target: ServicePriceChangeTarget.BUNDLE, bundleId: null, price: 3 },
      ]),
    ]);
    expect(timeline.has('BASE:cut')).toBe(true);
    expect(timeline.has('BASE:null')).toBe(false);
    expect(timeline.has('BUNDLE:null')).toBe(false);
  });

  it('lists the change dates inside a window', () => {
    const timeline = new PriceTimeline([
      change('c1', '2027-01-05', [base('cut', 1)]),
      change('c2', '2027-01-10', [base('cut', 2)]),
      change('c3', '2027-01-20', [base('cut', 3)]),
    ]);
    expect(timeline.changeDates('BASE:cut', '2027-01-05', '2027-01-20')).toEqual([
      '2027-01-10',
      '2027-01-20',
    ]);
  });
});
