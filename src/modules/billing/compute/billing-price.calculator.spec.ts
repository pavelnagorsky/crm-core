import { BillingPeriod, Prisma } from '@prisma/client';
import { BillingPriceCalculator } from './billing-price.calculator.js';

const dec = (v: string) => new Prisma.Decimal(v);

describe('BillingPriceCalculator (plan 7.1)', () => {
  describe.each([
    ['Master', '29.00', '290.00', '24.17'],
    ['Team', '59.00', '590.00', '49.17'],
  ])('%s %s / %s', (_name, month, year, perMonth) => {
    it('discountPercent is 17', () => {
      expect(
        BillingPriceCalculator.discountPercent(dec(month), dec(year)),
      ).toBe(17);
    });

    it(`yearly monthlyAmount is ${perMonth}`, () => {
      expect(
        BillingPriceCalculator.monthlyAmount(
          dec(year),
          BillingPeriod.YEAR,
        ).toFixed(2),
      ).toBe(perMonth);
    });

    it('monthly monthlyAmount is the amount itself', () => {
      expect(
        BillingPriceCalculator.monthlyAmount(
          dec(month),
          BillingPeriod.MONTH,
        ).toFixed(2),
      ).toBe(month);
    });
  });

  it('monthlyAmount rounds half up to 2 places', () => {
    // 100.02 / 12 = 8.335
    expect(
      BillingPriceCalculator.monthlyAmount(
        dec('100.02'),
        BillingPeriod.YEAR,
      ).toFixed(2),
    ).toBe('8.34');
  });

  it('discountPercent is 0 without a discount and null without both prices', () => {
    expect(
      BillingPriceCalculator.discountPercent(dec('10.00'), dec('120.00')),
    ).toBe(0);
    expect(
      BillingPriceCalculator.discountPercent(null, dec('290.00')),
    ).toBeNull();
    expect(
      BillingPriceCalculator.discountPercent(dec('29.00'), null),
    ).toBeNull();
    expect(
      BillingPriceCalculator.discountPercent(dec('0'), dec('0')),
    ).toBeNull();
  });
});
