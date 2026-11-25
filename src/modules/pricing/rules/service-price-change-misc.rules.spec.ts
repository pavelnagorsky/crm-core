import { ServicePriceChangeSkip, ServicePriceChangeTarget } from '@prisma/client';
import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { applyDecision, rollbackDecision } from './service-price-change-apply.rules.js';
import {
  assertPriceChangeDate,
  maxPriceChangeDate,
  parsePriceChangeSpec,
} from './service-price-change-spec.rules.js';
import { importChangeTitle, ruleChangeTitle } from './service-price-change-title.rules.js';
import { buildUpcoming } from './service-price-upcoming.rules.js';

describe('rollbackDecision', () => {
  const item = { applySkip: null, beforePrice: 5000, afterPrice: 5500 };
  const ok = (current: number | null) => ({ skip: null, current });

  it('restores "before" where the price still equals "after"', () => {
    expect(rollbackDecision(item, ok(5500))).toEqual({ kind: 'RESTORE', price: 5000 });
  });

  it('restores null (remove the price) and recognises an absent price as "after"', () => {
    expect(
      rollbackDecision({ ...item, beforePrice: null, afterPrice: 4000 }, ok(4000)),
    ).toEqual({ kind: 'RESTORE', price: null });
    expect(
      rollbackDecision({ ...item, beforePrice: 4000, afterPrice: null }, ok(null)),
    ).toEqual({ kind: 'RESTORE', price: 4000 });
  });

  it('skips a changed price as CHANGED_AFTER', () => {
    expect(rollbackDecision(item, ok(5600))).toEqual({
      kind: 'SKIP',
      skip: ServicePriceChangeSkip.CHANGED_AFTER,
    });
  });

  it('skips with the target reason and ignores rows that were never applied', () => {
    expect(
      rollbackDecision(item, { skip: ServicePriceChangeSkip.TARGET_DELETED, current: null }),
    ).toEqual({ kind: 'SKIP', skip: ServicePriceChangeSkip.TARGET_DELETED });
    expect(
      rollbackDecision(
        { ...item, applySkip: ServicePriceChangeSkip.STAFF_NOT_ASSIGNED },
        ok(5500),
      ),
    ).toEqual({ kind: 'IGNORE' });
  });
});

describe('applyDecision', () => {
  it('writes unless the target is gone or cannot take the price', () => {
    expect(applyDecision({ skip: null, current: 1 })).toEqual({ write: true, skip: null });
    expect(
      applyDecision({ skip: ServicePriceChangeSkip.BUNDLE_NOT_FIXED, current: null }),
    ).toEqual({ write: false, skip: ServicePriceChangeSkip.BUNDLE_NOT_FIXED });
  });
});

describe('ruleChangeTitle', () => {
  const t = (mode: ServicePriceChangeMode, value: number | null, step = 1) =>
    ruleChangeTitle({ mode, value, step }, 'BYN');
  it('formats percent, amount and new prices with a plain hyphen', () => {
    expect(t(ServicePriceChangeMode.PERCENT, 1000)).toBe('+10%');
    expect(t(ServicePriceChangeMode.PERCENT, -500)).toBe('-5%');
    expect(t(ServicePriceChangeMode.PERCENT, 250)).toBe('+2.5%');
    expect(t(ServicePriceChangeMode.AMOUNT, 500)).toBe('+5 BYN');
    expect(t(ServicePriceChangeMode.AMOUNT, -500)).toBe('-5 BYN');
    expect(t(ServicePriceChangeMode.SET, 8000)).toBe('Новые цены');
  });
  it('adds the rounding step unless it is 0.01', () => {
    expect(t(ServicePriceChangeMode.PERCENT, 1000, 100)).toBe('+10%, округление до 1 BYN');
    expect(t(ServicePriceChangeMode.PERCENT, 1000, 10)).toBe('+10%, округление до 0.1 BYN');
  });
  it('titles an upload', () => {
    expect(importChangeTitle('prices.xlsx')).toBe('Загрузка из Excel: prices.xlsx');
  });
});

describe('price change date and spec', () => {
  it('accepts null, the day after today, and two years ahead; rejects today and later', () => {
    expect(() => assertPriceChangeDate(null, '2026-11-25')).not.toThrow();
    expect(() => assertPriceChangeDate('2026-11-26', '2026-11-25')).not.toThrow();
    expect(() => assertPriceChangeDate(maxPriceChangeDate('2026-11-25'), '2026-11-25')).not.toThrow();
    expect(() => assertPriceChangeDate('2026-11-25', '2026-11-25')).toThrow();
    expect(() => assertPriceChangeDate('2028-12-30', '2026-11-25')).toThrow();
  });

  const dto = (over: object) =>
    parsePriceChangeSpec({
      allServices: true,
      serviceIds: [],
      categoryIds: [],
      bundleIds: [],
      mode: ServicePriceChangeMode.PERCENT,
      value: '10.00',
      priceRoundingStep: '1.00',
      include: { levelPrices: true, staffPrices: true, fixedBundles: true },
      effectiveDate: null,
      ...over,
    });

  it('converts to minor units and bounds the value by mode', () => {
    expect(dto({})).toMatchObject({ value: 1000, step: 100 });
    expect(() => dto({ value: '-99.01' })).toThrow();
    expect(() => dto({ value: '1000.01' })).toThrow();
    expect(() => dto({ value: null })).toThrow();
    expect(() => dto({ mode: ServicePriceChangeMode.SET, value: null })).not.toThrow();
    expect(() => dto({ mode: ServicePriceChangeMode.SET, value: '-1.00' })).toThrow();
    expect(() => dto({ allServices: false })).toThrow();
  });
});

describe('buildUpcoming', () => {
  const change = (effectiveDate: string, items: object[], id = 'c-' + effectiveDate) => ({
    id,
    effectiveDate,
    items: items as never[],
  });
  const base = (serviceId: string, afterPrice: number | null) => ({
    targetType: ServicePriceChangeTarget.BASE,
    serviceId,
    bundleId: null,
    afterPrice,
  });
  it('reports the nearest date with counts, and the nearest differing prices', () => {
    const view = buildUpcoming(
      [
        change('2027-01-01', [
          base('s1', 5500),
          base('s2', 3000),
          { targetType: ServicePriceChangeTarget.BUNDLE, serviceId: null, bundleId: 'b1', afterPrice: 9000 },
        ]),
        change('2027-01-01', [{ targetType: ServicePriceChangeTarget.LEVEL, serviceId: 's1', bundleId: null, afterPrice: 1 }], 'c-2027-01-01b'),
        change('2027-02-01', [base('s1', 6000)]),
      ],
      new Map([
        ['s1', 5000],
        ['s2', 3000],
      ]),
      new Map([['b1', 8000]]),
      '2026-12-31',
    );
    expect(view.next).toEqual({
      effectiveDate: '2027-01-01',
      changeIds: ['c-2027-01-01', 'c-2027-01-01b'],
      changesCount: 2,
      servicesCount: 2,
      bundlesCount: 1,
    });
    expect(view.services).toEqual([{ serviceId: 's1', changeId: 'c-2027-01-01', effectiveDate: '2027-01-01', price: 5500 }]);
    expect(view.bundles).toEqual([{ bundleId: 'b1', changeId: 'c-2027-01-01', effectiveDate: '2027-01-01', price: 9000 }]);
  });
  it('is empty without changes', () => {
    expect(buildUpcoming([], new Map(), new Map(), '2026-12-31')).toEqual({ next: null, services: [], bundles: [] });
  });
  it('drops changes dated on or before today', () => {
    const view = buildUpcoming(
      [
        change('2026-12-30', [base('s1', 5100)]),
        change('2026-12-31', [base('s1', 5200)]),
        change('2027-01-01', [base('s1', 5300)]),
      ],
      new Map([['s1', 5000]]),
      new Map(),
      '2026-12-31',
    );
    expect(view.next?.effectiveDate).toBe('2027-01-01');
    expect(view.services).toEqual([{ serviceId: 's1', changeId: 'c-2027-01-01', effectiveDate: '2027-01-01', price: 5300 }]);
    expect(
      buildUpcoming([change('2026-12-31', [base('s1', 5200)])], new Map(), new Map(), '2026-12-31'),
    ).toEqual({ next: null, services: [], bundles: [] });
  });
});

describe('level that became the default', () => {
  const state = { skip: ServicePriceChangeSkip.LEVEL_IS_DEFAULT, current: null };
  it('is skipped on apply', () => {
    expect(applyDecision(state)).toEqual({ write: false, skip: ServicePriceChangeSkip.LEVEL_IS_DEFAULT });
  });
  it('is skipped on rollback', () => {
    expect(
      rollbackDecision({ applySkip: null, beforePrice: 100, afterPrice: 200 }, state),
    ).toEqual({ kind: 'SKIP', skip: ServicePriceChangeSkip.LEVEL_IS_DEFAULT });
  });
});
