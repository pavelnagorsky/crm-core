import { PriceAdjustmentKind, PriceValueType, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsBreakdown } from '../interfaces/price-analytics-breakdown.interface.js';
import { PriceAnalyticsLayer } from '../interfaces/price-analytics-layer.interface.js';
import { PriceAnalyticsPrices } from '../interfaces/price-analytics-prices.interface.js';
import { afterReturns, priceItemBreakdown } from './price-analytics-item.rules.js';

const d = (value: string | number) => new Prisma.Decimal(value);

let order = 0;
const layer = (
  kind: PriceAdjustmentKind,
  amount: string,
  extra: Partial<PriceAnalyticsLayer> = {},
): PriceAnalyticsLayer => ({
  sortOrder: order++,
  kind,
  ruleId: null,
  title: kind,
  valueType: null,
  value: null,
  amount: d(amount),
  ...extra,
});
const surcharge = (amount: string, ruleId = 'surcharge-1', value = '15') =>
  layer(PriceAdjustmentKind.SURCHARGE, amount, {
    ruleId,
    title: `Rule ${ruleId}`,
    valueType: PriceValueType.PERCENT,
    value: d(value),
  });
const promotion = (amount: string, ruleId = 'promo-1') =>
  layer(PriceAdjustmentKind.PROMOTION, amount, {
    ruleId,
    title: `Promo ${ruleId}`,
    valueType: PriceValueType.PERCENT,
    value: d('15'),
  });
const clientDiscount = (amount: string) =>
  layer(PriceAdjustmentKind.CLIENT_DISCOUNT, amount, {
    title: 'Скидка клиента',
    valueType: PriceValueType.PERCENT,
    value: d('10'),
  });
const rounding = (amount: string) => layer(PriceAdjustmentKind.ROUNDING, amount);
const level = (amount: string) => layer(PriceAdjustmentKind.LEVEL, amount);

const prices = (
  regular: string,
  list: string,
  received: string,
  layers: PriceAnalyticsLayer[],
  custom = false,
): PriceAnalyticsPrices => ({
  regular: d(regular),
  list: d(list),
  received: d(received),
  custom,
  layers,
});

/** Amounts as strings, changes as [reason, ruleId, amount]. */
const plain = (breakdown: PriceAnalyticsBreakdown | null) =>
  breakdown && {
    regular: MoneyUtils.format(breakdown.regular),
    surcharges: MoneyUtils.format(breakdown.surcharges),
    discounts: MoneyUtils.format(breakdown.discounts),
    received: MoneyUtils.format(breakdown.received),
    changes: breakdown.changes.map((change) => [
      change.reason,
      change.ruleId,
      MoneyUtils.format(change.amount),
    ]),
  };

const expectInvariant = (breakdown: PriceAnalyticsBreakdown) => {
  expect(
    breakdown.regular
      .plus(breakdown.surcharges)
      .minus(breakdown.discounts)
      .equals(breakdown.received),
  ).toBe(true);
  for (const value of [
    breakdown.regular,
    breakdown.surcharges,
    breakdown.discounts,
    breakdown.received,
  ])
    expect(value.gte(0)).toBe(true);
  const surcharges = breakdown.changes
    .filter(
      (change) =>
        change.reason === PriceChangeReason.SURCHARGE ||
        change.reason === PriceChangeReason.CUSTOM_PRICE_UP,
    )
    .reduce((total, change) => total.plus(change.amount), d(0));
  expect(surcharges.equals(breakdown.surcharges)).toBe(true);
  expect(
    breakdown.changes
      .reduce((total, change) => total.plus(change.amount), d(0))
      .minus(surcharges)
      .equals(breakdown.discounts),
  ).toBe(true);
};

describe('priceItemBreakdown', () => {
  it('leaves an item without layers at its regular price', () => {
    const result = priceItemBreakdown(prices('40', '40', '40', []));
    expect(plain(result)).toEqual({
      regular: '40.00',
      surcharges: '0.00',
      discounts: '0.00',
      received: '40.00',
      changes: [],
    });
  });

  it('keeps level and staff prices in the regular price, with their rounding', () => {
    const result = priceItemBreakdown(
      prices('45', '45', '45', [level('4.7'), rounding('0.3')]),
    );
    expect(plain(result)).toMatchObject({ regular: '45.00', changes: [] });
  });

  it('splits a surcharge and a promotion, each with its own rounding', () => {
    // 40 -> +15% 6.00 -> 46.00 -> promotion -15% -6.90 -> 39.10 -> rounding -0.10 -> 39.00
    const result = priceItemBreakdown(
      prices('40', '46', '39', [
        surcharge('6'),
        promotion('-6.9'),
        rounding('-0.1'),
      ]),
    );
    expect(plain(result)).toEqual({
      regular: '40.00',
      surcharges: '6.00',
      discounts: '7.00',
      received: '39.00',
      changes: [
        [PriceChangeReason.SURCHARGE, 'surcharge-1', '6.00'],
        [PriceChangeReason.PROMOTION, 'promo-1', '7.00'],
      ],
    });
    expectInvariant(result);
  });

  it('attaches a rounding to the last surcharge before it', () => {
    // 40 + 4.00 (10%) + 2.00 (5%) = 46.00, rounded to 46.50
    const result = priceItemBreakdown(
      prices('40', '46.5', '46.5', [
        surcharge('4', 'a', '10'),
        surcharge('2', 'b', '5'),
        rounding('0.5'),
      ]),
    );
    expect(plain(result)?.changes).toEqual([
      [PriceChangeReason.SURCHARGE, 'a', '4.00'],
      [PriceChangeReason.SURCHARGE, 'b', '2.50'],
    ]);
    expectInvariant(result);
  });

  it('gives a rounding before any rule layer to the regular price', () => {
    const result = priceItemBreakdown(
      prices('40', '46', '46', [rounding('0.2'), surcharge('5.8')]),
    );
    expect(plain(result)).toMatchObject({
      regular: '40.20',
      surcharges: '5.80',
    });
    expectInvariant(result);
  });

  it('drops a surcharge its rounding cancels out', () => {
    const result = priceItemBreakdown(
      prices('40', '40', '40', [surcharge('0.3'), rounding('-0.3')]),
    );
    expect(plain(result)).toMatchObject({ regular: '40.00', changes: [] });
  });

  it('gives the whole discount to the client discount layer, with its rounding', () => {
    const result = priceItemBreakdown(
      prices('40', '40', '36', [clientDiscount('-4.2'), rounding('0.2')]),
    );
    expect(plain(result)).toEqual({
      regular: '40.00',
      surcharges: '0.00',
      discounts: '4.00',
      received: '36.00',
      changes: [[PriceChangeReason.CLIENT_DISCOUNT, null, '4.00']],
    });
    expect(result.changes[0]).toMatchObject({
      name: 'Скидка клиента',
      valueType: PriceValueType.PERCENT,
    });
  });

  it('keeps the rule id and the title of a promotion; a deleted rule has a null id', () => {
    const deleted = layer(PriceAdjustmentKind.PROMOTION, '-5', {
      title: 'Старая акция',
    });
    const result = priceItemBreakdown(prices('50', '50', '45', [deleted]));
    expect(result.changes).toEqual([
      expect.objectContaining({
        reason: PriceChangeReason.PROMOTION,
        ruleId: null,
        name: 'Старая акция',
        amount: d('5'),
      }),
    ]);
  });

  it('replaces the automatic discount with a custom price below the list price', () => {
    const result = priceItemBreakdown(
      prices('40', '46', '30', [surcharge('6'), promotion('-6.9')], true),
    );
    expect(plain(result)).toEqual({
      regular: '40.00',
      surcharges: '6.00',
      discounts: '16.00',
      received: '30.00',
      changes: [
        [PriceChangeReason.SURCHARGE, 'surcharge-1', '6.00'],
        [PriceChangeReason.CUSTOM_PRICE_DOWN, null, '16.00'],
      ],
    });
    expect(result.changes[1]).toMatchObject({
      name: 'Своя цена',
      valueType: null,
      value: null,
    });
    expectInvariant(result);
  });

  it('counts a custom price above the list price as a surcharge', () => {
    const result = priceItemBreakdown(
      prices('40', '46', '55', [surcharge('6'), promotion('-6.9')], true),
    );
    expect(plain(result)).toEqual({
      regular: '40.00',
      surcharges: '15.00',
      discounts: '0.00',
      received: '55.00',
      changes: [
        [PriceChangeReason.SURCHARGE, 'surcharge-1', '6.00'],
        [PriceChangeReason.CUSTOM_PRICE_UP, null, '9.00'],
      ],
    });
    expectInvariant(result);
  });

  it('has no change for a custom price equal to the list price', () => {
    const result = priceItemBreakdown(
      prices('40', '40', '40', [promotion('-4')], true),
    );
    expect(plain(result)).toMatchObject({ regular: '40.00', changes: [] });
  });

  it('keeps several discount layers only when they add up to the discount', () => {
    const exact = priceItemBreakdown(
      prices('40', '40', '33', [promotion('-4', 'a'), promotion('-3', 'b')]),
    );
    expect(plain(exact)?.changes).toEqual([
      [PriceChangeReason.PROMOTION, 'a', '4.00'],
      [PriceChangeReason.PROMOTION, 'b', '3.00'],
    ]);
    const off = priceItemBreakdown(
      prices('40', '40', '30', [promotion('-4', 'a'), promotion('-3', 'b')]),
    );
    expect(plain(off)).toMatchObject({
      regular: '30.00',
      discounts: '0.00',
      changes: [],
    });
    expectInvariant(off);
  });

  describe('inconsistent legacy layouts go to the regular price', () => {
    it('a list price above the staff price without a surcharge layer', () => {
      const result = priceItemBreakdown(prices('40', '46', '46', []));
      expect(plain(result)).toMatchObject({
        regular: '46.00',
        surcharges: '0.00',
        changes: [],
      });
    });

    it('a surcharge layer smaller than the difference keeps the layer amount', () => {
      const result = priceItemBreakdown(prices('40', '47', '47', [surcharge('6')]));
      expect(plain(result)).toMatchObject({
        regular: '41.00',
        surcharges: '6.00',
      });
      expectInvariant(result);
    });

    it('surcharge layers larger than the list price are dropped', () => {
      const result = priceItemBreakdown(prices('10', '10', '10', [surcharge('60')]));
      expect(plain(result)).toMatchObject({
        regular: '10.00',
        surcharges: '0.00',
        changes: [],
      });
    });

    it('a discount without a discount layer', () => {
      const result = priceItemBreakdown(prices('40', '40', '35', []));
      expect(plain(result)).toMatchObject({
        regular: '35.00',
        discounts: '0.00',
        received: '35.00',
      });
    });

    it('an unexplained discount below the surcharges drops the surcharges', () => {
      const result = priceItemBreakdown(prices('40', '46', '3', [surcharge('6')]));
      expect(plain(result)).toMatchObject({
        regular: '3.00',
        surcharges: '0.00',
        discounts: '0.00',
        changes: [],
      });
      expectInvariant(result);
    });

    it('a charged price above the list price without a custom price', () => {
      const result = priceItemBreakdown(prices('40', '40', '42', [promotion('-2')]));
      expect(plain(result)).toMatchObject({
        regular: '42.00',
        discounts: '0.00',
        changes: [],
      });
    });
  });

  it('holds the invariant over many random layouts', () => {
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let i = 0; i < 500; i++) {
      const regular = random(10_000);
      const layers: PriceAnalyticsLayer[] = [];
      let list = regular;
      if (random(2)) {
        const amount = random(3_000) - 500;
        layers.push(surcharge(MoneyUtils.fromMinor(amount).toString()));
        list += amount;
      }
      if (random(2)) {
        const amount = random(100) - 50;
        layers.push(rounding(MoneyUtils.fromMinor(amount).toString()));
        list += amount;
      }
      list = Math.max(0, list + (random(4) === 0 ? random(500) - 250 : 0));
      const received = Math.max(0, list - random(list + 1));
      if (random(2))
        layers.push(
          random(2)
            ? promotion(MoneyUtils.fromMinor(received - list).toString())
            : clientDiscount(MoneyUtils.fromMinor(received - list - random(3)).toString()),
        );
      const custom = random(3) === 0;
      const result = priceItemBreakdown({
        regular: MoneyUtils.fromMinor(regular),
        list: MoneyUtils.fromMinor(list),
        received: MoneyUtils.fromMinor(custom ? random(20_000) : received),
        custom,
        layers,
      });
      expectInvariant(result);
    }
  });
});

describe('afterReturns', () => {
  // 3 pcs at 10.00 = 30.00, promotion -15% = -4.50, line total 25.50
  const line = () =>
    priceItemBreakdown(prices('30', '30', '25.5', [promotion('-4.5')]));

  it('returns the breakdown as is without returns', () => {
    const breakdown = line();
    expect(afterReturns(breakdown, d(3), d(0))).toBe(breakdown);
  });

  it('leaves out a fully returned line', () => {
    expect(afterReturns(line(), d(3), d(3))).toBeNull();
  });

  it('shrinks every amount by the returned share as the returns allocate it', () => {
    const result = afterReturns(line(), d(3), d(1));
    // Return of 1 of 3: line total 8.50 (half-up), discount 1.50 (down).
    expect(plain(result)).toEqual({
      regular: '20.00',
      surcharges: '0.00',
      discounts: '3.00',
      received: '17.00',
      changes: [[PriceChangeReason.PROMOTION, 'promo-1', '3.00']],
    });
    expectInvariant(result as PriceAnalyticsBreakdown);
  });

  it('matches what the returns of the line took back, cumulatively', () => {
    // 3 pcs, line total 10.00, discount 2.00: returns 1 + 1 of 3 allocate 3.33 + 3.34 and
    // 0.66 + 0.67; what is left is 3.33 and 0.67.
    const breakdown = priceItemBreakdown(
      prices('12', '12', '10', [clientDiscount('-2')]),
    );
    let allocatedTotal = d(0);
    let allocatedDiscount = d(0);
    for (let i = 0; i < 2; i++) {
      allocatedTotal = allocatedTotal.plus(
        MoneyUtils.allocateCumulative(d(10), d(3), d(1), d(i), allocatedTotal),
      );
      allocatedDiscount = allocatedDiscount.plus(
        MoneyUtils.allocateCumulativeDown(d(2), d(3), d(1), d(i), allocatedDiscount),
      );
    }
    const result = afterReturns(breakdown, d(3), d(2)) as PriceAnalyticsBreakdown;
    expect(result.received.equals(d(10).minus(allocatedTotal))).toBe(true);
    expect(result.discounts.equals(d(2).minus(allocatedDiscount))).toBe(true);
    expectInvariant(result);
  });

  it('shrinks a custom price change and drops a change that shrinks to zero', () => {
    // 2 pcs: list 0.02, custom line total 0.03 (CUSTOM_PRICE_UP 0.01); 1 returned takes
    // 0.02 of the total (half-up of 0.015) and the whole 0.01 of the change (half-up of 0.005).
    const breakdown = priceItemBreakdown(prices('0.02', '0.02', '0.03', [], true));
    expect(plain(breakdown)?.changes).toEqual([
      [PriceChangeReason.CUSTOM_PRICE_UP, null, '0.01'],
    ]);
    const result = afterReturns(breakdown, d(2), d(1)) as PriceAnalyticsBreakdown;
    expect(plain(result)).toEqual({
      regular: '0.01',
      surcharges: '0.00',
      discounts: '0.00',
      received: '0.01',
      changes: [],
    });
    expectInvariant(result);
  });

  it('works with fractional quantities; the regular price takes the rounding residue', () => {
    // 0.750 kg, list 37.50, promotion 5.63 -> 31.87; 0.250 returned: the return took
    // 10.62 (half-up of 10.623) of the total and 1.87 (down of 1.877) of the discount.
    const breakdown = priceItemBreakdown(
      prices('37.5', '37.5', '31.87', [promotion('-5.63')]),
    );
    const result = afterReturns(breakdown, d('0.75'), d('0.25')) as PriceAnalyticsBreakdown;
    expect(plain(result)).toEqual({
      regular: '25.01',
      surcharges: '0.00',
      discounts: '3.76',
      received: '21.25',
      changes: [[PriceChangeReason.PROMOTION, 'promo-1', '3.76']],
    });
    expectInvariant(result);
  });
});
