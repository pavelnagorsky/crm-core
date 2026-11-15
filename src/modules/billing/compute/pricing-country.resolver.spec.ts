import {
  BillingPeriod,
  BillingPlanPrice,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Prisma,
} from '@prisma/client';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { PricingCountryResolver } from './pricing-country.resolver.js';

const NOW = new Date('2026-12-01T12:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');

let seq = 0;
const price = (
  planId: string,
  countryCode: string,
  currency: string,
  billingPeriod: BillingPeriod,
  amount: string,
  effectiveFrom: Date = PAST,
): BillingPlanPrice => ({
  id: `price-${++seq}`,
  planId,
  countryCode,
  currency,
  billingPeriod,
  amount: new Prisma.Decimal(amount),
  effectiveFrom,
  createdById: null,
  createdAt: PAST,
});

const plan = (
  id: string,
  position: number,
  prices: BillingPlanPrice[],
  pricingMode: BillingPlanPricingMode = BillingPlanPricingMode.STANDARD,
): BillingPlanWithPrices => ({
  id,
  code: id,
  name: id,
  position,
  status: BillingPlanStatus.ACTIVE,
  isPublic: true,
  pricingMode,
  staffLimit: null,
  locationLimit: null,
  createdAt: PAST,
  updatedAt: PAST,
  updatedById: null,
  prices,
});

const { MONTH, YEAR } = BillingPeriod;

const master = plan('master', 1, [
  price('master', 'BY', 'BYN', MONTH, '29.00'),
  price('master', 'BY', 'BYN', YEAR, '290.00'),
  price('master', 'KZ', 'KZT', MONTH, '4900.00'),
]);
const team = plan('team', 2, [
  price('team', 'BY', 'BYN', MONTH, '59.00'),
  price('team', 'BY', 'BYN', YEAR, '590.00'),
]);
const network = plan('network', 3, [], BillingPlanPricingMode.CUSTOM);
const plans = [master, team, network];

const sub = (
  overrides: Partial<{
    countryCode: string;
    planId: string | null;
    customCurrency: string | null;
    customMonthlyPrice: Prisma.Decimal | null;
    customYearlyPrice: Prisma.Decimal | null;
  }> = {},
) => ({
  countryCode: 'BY',
  planId: null,
  customCurrency: null,
  customMonthlyPrice: null,
  customYearlyPrice: null,
  ...overrides,
});

describe('PricingCountryResolver (plan 2.3)', () => {
  describe('pricingCountry', () => {
    it('uses the own country when it has a current price', () => {
      expect(
        PricingCountryResolver.pricingCountry(plans, 'BY', 'BY', NOW),
      ).toBe('BY');
      expect(
        PricingCountryResolver.pricingCountry(plans, 'KZ', 'BY', NOW),
      ).toBe('KZ');
    });

    it('falls back to the default country without prices', () => {
      expect(
        PricingCountryResolver.pricingCountry(plans, 'RU', 'BY', NOW),
      ).toBe('BY');
    });

    it('ignores prices that are not in force yet', () => {
      const ruLater = plan('master', 1, [
        ...master.prices,
        price('master', 'RU', 'RUB', MONTH, '990.00', FUTURE),
      ]);
      expect(
        PricingCountryResolver.pricingCountry([ruLater, team], 'RU', 'BY', NOW),
      ).toBe('BY');
      expect(
        PricingCountryResolver.pricingCountry(
          [ruLater, team],
          'RU',
          'BY',
          FUTURE,
        ),
      ).toBe('RU');
    });
  });

  describe('currentPrice', () => {
    it('takes the latest version already in force', () => {
      const prices = [
        price(
          'master',
          'BY',
          'BYN',
          MONTH,
          '25.00',
          new Date('2025-01-01T00:00:00Z'),
        ),
        price(
          'master',
          'BY',
          'BYN',
          MONTH,
          '29.00',
          new Date('2026-06-01T00:00:00Z'),
        ),
        price('master', 'BY', 'BYN', MONTH, '35.00', FUTURE),
      ];
      expect(
        PricingCountryResolver.currentPrice(
          prices,
          'BY',
          MONTH,
          NOW,
        )?.amount.toFixed(2),
      ).toBe('29.00');
      expect(
        PricingCountryResolver.currentPrice(
          prices,
          'BY',
          MONTH,
          FUTURE,
        )?.amount.toFixed(2),
      ).toBe('35.00');
    });

    it('is null before the first version takes effect', () => {
      const prices = [price('master', 'BY', 'BYN', MONTH, '29.00', FUTURE)];
      expect(
        PricingCountryResolver.currentPrice(prices, 'BY', MONTH, NOW),
      ).toBeNull();
    });

    it('matches country and period', () => {
      expect(
        PricingCountryResolver.currentPrice(master.prices, 'KZ', YEAR, NOW),
      ).toBeNull();
      expect(
        PricingCountryResolver.currentPrice(master.prices, 'RU', MONTH, NOW),
      ).toBeNull();
    });
  });

  describe('catalog', () => {
    it('returns the own country prices', () => {
      const c = PricingCountryResolver.catalog(plans, 'BY', 'BY', NOW);
      expect(c).toMatchObject({
        country: 'BY',
        pricingCountry: 'BY',
        currency: 'BYN',
      });
      expect(
        c.plans.map((p) => p.prices?.MONTH?.amount.toFixed(2) ?? null),
      ).toEqual(['29.00', '59.00', null]);
      expect(c.plans[0].prices?.YEAR?.amount.toFixed(2)).toBe('290.00');
    });

    it('a country without prices gets the default country prices', () => {
      const c = PricingCountryResolver.catalog(plans, 'RU', 'BY', NOW);
      expect(c).toMatchObject({
        country: 'RU',
        pricingCountry: 'BY',
        currency: 'BYN',
      });
      expect(c.plans[1].prices?.MONTH?.currency).toBe('BYN');
    });

    it('a plan without a price in the pricing country gets prices: null, currencies never mix', () => {
      const c = PricingCountryResolver.catalog(plans, 'KZ', 'BY', NOW);
      expect(c).toMatchObject({
        country: 'KZ',
        pricingCountry: 'KZ',
        currency: 'KZT',
      });
      expect(c.plans[0].prices?.MONTH?.currency).toBe('KZT');
      expect(c.plans[0].prices?.YEAR).toBeNull();
      expect(c.plans[1].prices).toBeNull();
      expect(c.plans[2].prices).toBeNull();
      for (const p of c.plans)
        for (const v of [p.prices?.MONTH, p.prices?.YEAR, ...p.upcoming])
          if (v) expect(v.countryCode).toBe('KZ');
    });

    it('lists a future price as upcoming, not current', () => {
      const withUpcoming = plan('team', 2, [
        ...team.prices,
        price('team', 'BY', 'BYN', MONTH, '69.00', FUTURE),
        price('team', 'KZ', 'KZT', MONTH, '9900.00', FUTURE),
      ]);
      const c = PricingCountryResolver.catalog(
        [master, withUpcoming],
        'BY',
        'BY',
        NOW,
      );
      expect(c.plans[1].prices?.MONTH?.amount.toFixed(2)).toBe('59.00');
      expect(c.plans[1].upcoming.map((p) => p.amount.toFixed(2))).toEqual([
        '69.00',
      ]);
    });
  });

  describe('currency', () => {
    it('takes the currency of the country prices, else the country default', () => {
      expect(PricingCountryResolver.currency(plans, 'BY')).toBe('BYN');
      expect(PricingCountryResolver.currency(plans, 'KZ')).toBe('KZT');
      expect(PricingCountryResolver.currency(plans, 'RU')).toBe('RUB');
    });
  });

  describe('subscriptionPrice', () => {
    it('uses the pricing country for a STANDARD plan', () => {
      const p = PricingCountryResolver.subscriptionPrice(
        sub({ countryCode: 'RU' }),
        team,
        YEAR,
        plans,
        'BY',
        NOW,
      );
      expect(p).toMatchObject({ countryCode: 'BY', currency: 'BYN' });
      expect(p?.amount.toFixed(2)).toBe('590.00');
    });

    it('is null for a STANDARD plan without a price in the pricing country', () => {
      expect(
        PricingCountryResolver.subscriptionPrice(
          sub({ countryCode: 'KZ' }),
          team,
          MONTH,
          plans,
          'BY',
          NOW,
        ),
      ).toBeNull();
    });

    it('a CUSTOM plan has a price only on its own subscription', () => {
      const custom = sub({
        planId: 'network',
        customMonthlyPrice: new Prisma.Decimal('199.00'),
        customYearlyPrice: null,
      });
      const p = PricingCountryResolver.subscriptionPrice(
        custom,
        network,
        MONTH,
        plans,
        'BY',
        NOW,
      );
      expect(p).toMatchObject({ countryCode: 'BY', currency: 'BYN' });
      expect(p?.amount.toFixed(2)).toBe('199.00');
      expect(
        PricingCountryResolver.subscriptionPrice(
          custom,
          network,
          YEAR,
          plans,
          'BY',
          NOW,
        ),
      ).toBeNull();
      expect(
        PricingCountryResolver.subscriptionPrice(
          sub(),
          network,
          MONTH,
          plans,
          'BY',
          NOW,
        ),
      ).toBeNull();
    });
  });
});
