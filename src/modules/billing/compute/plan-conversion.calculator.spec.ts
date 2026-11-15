import { Prisma } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PlanConversionCalculator } from './plan-conversion.calculator.js';

const TZ = 'Europe/Minsk';
const at = (local: string): Date =>
  TimeUtils.localToUtc(local.length === 10 ? `${local}T00:00:00` : local, TZ);
const dec = (v: string) => new Prisma.Decimal(v);

const MASTER = dec('29.00');
const TEAM = dec('59.00');

const sub = (trialEndsAt: string, paidUntil: string | null) => ({
  timezone: TZ,
  trialEndsAt: at(trialEndsAt),
  paidUntil: paidUntil ? at(paidUntil) : null,
});

describe('PlanConversionCalculator (plan 4.4)', () => {
  describe('upgrade and downgrade', () => {
    it('20 days of Master (29) become ~10 days of Team (59)', () => {
      // 20 × 29 / 59 = 9.83 days → rounds up to the 11th local midnight.
      const s = sub('2026-12-14', '2027-01-21');
      expect(
        PlanConversionCalculator.convert(s, MASTER, TEAM, at('2027-01-01')),
      ).toEqual(at('2027-01-11'));
    });

    it('10 days of Team (59) become ~20 days of Master (29)', () => {
      // 10 × 59 / 29 = 20.34 days → rounds down to the 21st local midnight.
      const s = sub('2026-12-14', '2027-01-11');
      expect(
        PlanConversionCalculator.convert(s, TEAM, MASTER, at('2027-01-01')),
      ).toEqual(at('2027-01-21'));
    });

    it('keeps paidUntil when the prices are equal', () => {
      const s = sub('2026-12-14', '2027-01-21');
      expect(
        PlanConversionCalculator.convert(
          s,
          MASTER,
          MASTER,
          at('2027-01-05T15:00:00'),
        ),
      ).toEqual(at('2027-01-21'));
    });
  });

  describe('trial remainder is not converted', () => {
    it('paidFrom is trialEndsAt during the trial, now after it', () => {
      const s = sub('2026-12-14', '2027-01-14');
      expect(PlanConversionCalculator.paidFrom(s, at('2026-12-05'))).toEqual(
        at('2026-12-14'),
      );
      expect(
        PlanConversionCalculator.paidFrom(s, at('2026-12-20T10:00:00')),
      ).toEqual(at('2026-12-20T10:00:00'));
    });

    it('converts only the paid month after the trial (upgrade)', () => {
      // 31 days × 29 / 59 = 15.24 days from 14 Dec → 29 Dec.
      const s = sub('2026-12-14', '2027-01-14');
      expect(
        PlanConversionCalculator.convert(s, MASTER, TEAM, at('2026-12-05')),
      ).toEqual(at('2026-12-29'));
    });

    it('converts only the paid month after the trial (downgrade)', () => {
      // 31 days × 59 / 29 = 63.07 days from 14 Dec → 15 Feb.
      const s = sub('2026-12-14', '2027-01-14');
      expect(
        PlanConversionCalculator.convert(s, TEAM, MASTER, at('2026-12-05')),
      ).toEqual(at('2027-02-15'));
    });
  });

  describe('rounding to local midnight', () => {
    it('half a day rounds up', () => {
      // 3 days × 1/2 = 1.5 days → day 2.
      const s = sub('2026-12-14', '2027-01-04');
      expect(
        PlanConversionCalculator.convert(
          s,
          dec('1'),
          dec('2'),
          at('2027-01-01'),
        ),
      ).toEqual(at('2027-01-03'));
    });

    it('less than half a day rounds down', () => {
      // 3 days × 0.49 = 1.47 days → day 1.
      const s = sub('2026-12-14', '2027-01-04');
      expect(
        PlanConversionCalculator.convert(
          s,
          dec('49'),
          dec('100'),
          at('2027-01-01'),
        ),
      ).toEqual(at('2027-01-02'));
    });

    it('lands on a local midnight even when now is mid-day', () => {
      const s = sub('2026-12-14', '2027-01-21');
      const result = PlanConversionCalculator.convert(
        s,
        MASTER,
        TEAM,
        at('2027-01-01T17:23:00'),
      );
      const p = TimeUtils.toZonedParts(result, TZ);
      expect([p.hour, p.minute, p.second]).toEqual([0, 0, 0]);
      // 19.28 days × 29 / 59 = 9.47 days from 1 Jan 17:23 → 11 Jan ~04:46 → 11 Jan.
      expect(result).toEqual(at('2027-01-11'));
    });
  });

  describe('hasPaidRemainder', () => {
    it('is false without a payment or when the payment ends inside the trial', () => {
      expect(
        PlanConversionCalculator.hasPaidRemainder(
          sub('2026-12-14', null),
          at('2026-12-01'),
        ),
      ).toBe(false);
      expect(
        PlanConversionCalculator.hasPaidRemainder(
          sub('2027-01-20', '2027-01-14'),
          at('2027-01-01'),
        ),
      ).toBe(false);
    });

    it('is false in the grace days and true with paid days ahead', () => {
      const s = sub('2026-12-14', '2027-01-14');
      expect(
        PlanConversionCalculator.hasPaidRemainder(s, at('2027-01-15')),
      ).toBe(false);
      expect(
        PlanConversionCalculator.hasPaidRemainder(s, at('2026-12-05')),
      ).toBe(true);
      expect(
        PlanConversionCalculator.hasPaidRemainder(s, at('2027-01-13T23:00:00')),
      ).toBe(true);
    });

    it('convert refuses without a paid remainder', () => {
      expect(() =>
        PlanConversionCalculator.convert(
          sub('2026-12-14', null),
          MASTER,
          TEAM,
          at('2026-12-01'),
        ),
      ).toThrow(RangeError);
    });
  });
});
