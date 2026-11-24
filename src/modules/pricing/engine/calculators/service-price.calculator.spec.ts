import { LineQuote } from '../interfaces/line-quote.interface.js';
import { QuoteRequest } from '../interfaces/quote-request.interface.js';
import {
  fixedBundle,
  pricingSnapshot,
  quoteLine,
  sumBundle,
} from '../testing/pricing-snapshot.factory.js';
import { ServicePriceCalculator } from './service-price.calculator.js';

/** Stage 1 has no rules: every layer equals the base price and nothing is adjusted. */
function expectFlatLayers(line: LineQuote, basePrice: number): void {
  expect(line).toMatchObject({
    basePrice,
    staffPrice: basePrice,
    listPrice: basePrice,
    discountTotal: 0,
    chargedPrice: basePrice,
    adjustments: [],
  });
}

describe('ServicePriceCalculator (plan 2.1, 5.2)', () => {
  const snapshot = pricingSnapshot();

  describe.each([
    ['separate services', null, ['cut', 'color'], [6000, 9000]],
    ['separate services, one line', null, ['wash'], [1500]],
    [
      'separate services, same service twice',
      null,
      ['cut', 'cut'],
      [6000, 6000],
    ],
    [
      'SUM bundle keeps catalog prices',
      'sum-bundle',
      ['cut', 'color'],
      [6000, 9000],
    ],
    [
      'FIXED bundle 120.00 over 60.00 / 90.00',
      'fixed-bundle',
      ['cut', 'color'],
      [4800, 7200],
    ],
    [
      'FIXED bundle in reverse item order',
      'fixed-bundle',
      ['color', 'cut'],
      [7200, 4800],
    ],
    [
      'FIXED bundle over a repeated service',
      'fixed-bundle',
      ['cut', 'cut', 'cut'],
      [4000, 4000, 4000],
    ],
  ])('%s', (_name, bundleId, serviceIds, basePrices) => {
    const request: QuoteRequest = {
      bundleId,
      visit: null,
      lines: serviceIds.map((serviceId) => quoteLine(serviceId)),
    };
    const quote = ServicePriceCalculator.quote(snapshot, request);

    it(`base prices are [${basePrices.join(', ')}] in request order`, () => {
      expect(quote.lines.map((line) => line.serviceId)).toEqual(serviceIds);
      expect(quote.lines.map((line) => line.basePrice)).toEqual(basePrices);
    });

    it('staff, list and charged price equal the base price, no discount', () => {
      quote.lines.forEach((line, index) =>
        expectFlatLayers(line, basePrices[index]),
      );
    });

    it('line total is the charged price and the visit sums the lines', () => {
      const sum = basePrices.reduce((acc, price) => acc + price, 0);
      expect(quote.lines.map((line) => line.total)).toEqual(basePrices);
      expect(quote).toMatchObject({
        listTotal: sum,
        discountTotal: 0,
        total: sum,
      });
    });
  });

  it('splits a FIXED bundle with an odd price by largest remainder', () => {
    const quote = ServicePriceCalculator.quote(
      pricingSnapshot({ bundles: [fixedBundle('fixed-bundle', 10001)] }),
      {
        bundleId: 'fixed-bundle',
        visit: null,
        lines: [quoteLine('cut'), quoteLine('cut'), quoteLine('cut')],
      },
    );
    expect(quote.lines.map((line) => line.basePrice)).toEqual([
      3334, 3334, 3333,
    ]);
    expect(quote.total).toBe(10001);
  });

  describe.each([
    ['separate services', null, [6000, 9000]],
    ['FIXED bundle', 'fixed-bundle', [4800, 7200]],
  ])('customPrice on %s', (_name, bundleId, basePrices) => {
    const quote = ServicePriceCalculator.quote(snapshot, {
      bundleId,
      visit: null,
      lines: [quoteLine('cut', 5000), quoteLine('color')],
    });

    it('sets the line total and keeps the layers as history', () => {
      expect(quote.lines[0]).toMatchObject({ customPrice: 5000, total: 5000 });
      expectFlatLayers(quote.lines[0], basePrices[0]);
      expect(quote.lines[1]).toMatchObject({
        customPrice: null,
        total: basePrices[1],
      });
    });

    it('visit total uses the custom price, list total keeps the list prices', () => {
      expect(quote.total).toBe(5000 + basePrices[1]);
      expect(quote.listTotal).toBe(basePrices[0] + basePrices[1]);
    });
  });

  it.each([
    ['zero custom price', 0, 0],
    ['custom price above the list price', 7500, 7500],
  ])('%s becomes the total', (_name, customPrice, total) => {
    const quote = ServicePriceCalculator.quote(snapshot, {
      bundleId: null,
      visit: null,
      lines: [quoteLine('cut', customPrice)],
    });
    expect(quote.lines[0].total).toBe(total);
    expect(quote.total).toBe(total);
    expect(quote.listTotal).toBe(6000);
  });

  it('prices a line without staff the same way (preview)', () => {
    const quote = ServicePriceCalculator.quote(snapshot, {
      bundleId: null,
      visit: null,
      lines: [quoteLine('cut', null, null)],
    });
    expectFlatLayers(quote.lines[0], 6000);
  });

  it('returns an empty visit for no lines', () => {
    expect(
      ServicePriceCalculator.quote(snapshot, { bundleId: null, lines: [], visit: null }),
    ).toEqual({ lines: [], listTotal: 0, discountTotal: 0, total: 0, promoCode: null });
  });

  it.each([
    ['separate services', null],
    ['SUM bundle', 'sum-bundle'],
    ['FIXED bundle', 'fixed-bundle'],
  ])('is deterministic for %s', (_name, bundleId) => {
    const request = (): QuoteRequest => ({
      bundleId,
      visit: null,
      lines: [quoteLine('cut', 5000), quoteLine('color'), quoteLine('wash')],
    });
    expect(ServicePriceCalculator.quote(pricingSnapshot(), request())).toEqual(
      ServicePriceCalculator.quote(pricingSnapshot(), request()),
    );
  });

  it('does not mutate the snapshot or the request', () => {
    const input = pricingSnapshot();
    const request: QuoteRequest = {
      bundleId: 'fixed-bundle',
      visit: null,
      lines: [quoteLine('cut'), quoteLine('color')],
    };
    const before = structuredClone({ input, request });
    ServicePriceCalculator.quote(input, request);
    expect({ input, request }).toEqual(before);
  });

  it.each([
    ['unknown service', null, 'missing', /Service missing is not priced/],
    ['unknown bundle', 'missing', 'cut', /Bundle missing is not priced/],
    [
      'FIXED bundle without a price',
      'no-price',
      'cut',
      /Fixed bundle no-price has no price/,
    ],
  ])('throws for %s', (_name, bundleId, serviceId, message) => {
    const input = pricingSnapshot({
      bundles: [sumBundle('sum-bundle'), fixedBundle('no-price', null)],
    });
    expect(() =>
      ServicePriceCalculator.quote(input, {
        bundleId,
        visit: null,
        lines: [quoteLine(serviceId)],
      }),
    ).toThrow(message);
  });
});
