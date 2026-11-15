import { BillingPeriod } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { SubscriptionDates } from '../interfaces/subscription-dates.interface.js';
import { BillingPeriodCalculator } from './billing-period.calculator.js';
import { SubscriptionStateCalculator } from './subscription-state.calculator.js';

const TZ = 'Europe/Minsk';
const GRACE_DAYS = 3;

const at = (local: string, tz = TZ): Date =>
  TimeUtils.localToUtc(local.length === 10 ? `${local}T00:00:00` : local, tz);

interface PeriodSub {
  timezone: string;
  trialEndsAt: Date;
  accessEndsAt: Date;
  paidUntil: Date | null;
  billingAnchorDay: number | null;
}

const sub = (overrides: Partial<PeriodSub> = {}): PeriodSub => ({
  timezone: TZ,
  trialEndsAt: at('2026-12-14'),
  accessEndsAt: at('2026-12-14'),
  paidUntil: null,
  billingAnchorDay: null,
  ...overrides,
});

const graceEndsAt = (s: PeriodSub, graceDays = GRACE_DAYS): Date => {
  const dates: SubscriptionDates = {
    timezone: s.timezone,
    trialEndsAt: s.trialEndsAt,
    paidUntil: s.paidUntil,
    accessEndsAt: s.accessEndsAt,
    graceExtendedUntil: null,
    suspendedAt: null,
  };
  return SubscriptionStateCalculator.graceEndsAt(dates, graceDays);
};

const pay = (
  s: PeriodSub,
  paidAt: Date,
  period: BillingPeriod = BillingPeriod.MONTH,
) => BillingPeriodCalculator.paidPeriod(s, graceEndsAt(s), paidAt, period);

/** Applies a payment the way plan 4.2 does, for chains of payments. */
const applied = (
  s: PeriodSub,
  paidAt: Date,
  period: BillingPeriod = BillingPeriod.MONTH,
) => {
  const r = pay(s, paidAt, period);
  const next: PeriodSub = {
    ...s,
    paidUntil: r.periodEnd,
    billingAnchorDay: r.anchorDay,
    accessEndsAt: r.periodEnd > s.trialEndsAt ? r.periodEnd : s.trialEndsAt,
  };
  return { r, next };
};

describe('BillingPeriodCalculator', () => {
  describe('plan 4.3 table (trial until 13 Dec inclusive, one month)', () => {
    it('payment in the trial (5 Dec) starts 14 Dec, ends after 13 Jan', () => {
      const r = pay(sub(), at('2026-12-05T15:00:00'));
      expect(r.periodStart).toEqual(at('2026-12-14'));
      expect(r.periodEnd).toEqual(at('2027-01-14'));
      expect(r.anchorDay).toBe(14);
      expect(SubscriptionStateCalculator.lastDayBefore(r.periodEnd, TZ)).toBe(
        '2027-01-13',
      );
    });

    it('payment in the grace days after the trial (16 Dec) starts 14 Dec', () => {
      const r = pay(sub(), at('2026-12-16T23:00:00'));
      expect(r.periodStart).toEqual(at('2026-12-14'));
      expect(r.periodEnd).toEqual(at('2027-01-14'));
    });

    it('payment in the grace days after a paid period (paid till 13 Jan, pays 15th) starts 14 Jan', () => {
      const s = sub({
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-14'),
        billingAnchorDay: 14,
      });
      const r = pay(s, at('2027-01-15T11:00:00'));
      expect(r.periodStart).toEqual(at('2027-01-14'));
      expect(r.periodEnd).toEqual(at('2027-02-14'));
      expect(r.anchorDay).toBe(14);
    });

    it('payment after the block (20 Dec) starts 20 Dec, ends after 19 Jan', () => {
      const r = pay(sub(), at('2026-12-20T18:45:00'));
      expect(r.periodStart).toEqual(at('2026-12-20'));
      expect(r.periodEnd).toEqual(at('2027-01-20'));
      expect(r.anchorDay).toBe(20);
      expect(SubscriptionStateCalculator.lastDayBefore(r.periodEnd, TZ)).toBe(
        '2027-01-19',
      );
    });

    it('second brand (created 10 Dec, no trial) paying on the 12th starts 10 Dec', () => {
      const s = sub({
        trialEndsAt: at('2026-12-10'),
        accessEndsAt: at('2026-12-10'),
      });
      const r = pay(s, at('2026-12-12T09:00:00'));
      expect(r.periodStart).toEqual(at('2026-12-10'));
      expect(r.periodEnd).toEqual(at('2027-01-10'));
      expect(SubscriptionStateCalculator.lastDayBefore(r.periodEnd, TZ)).toBe(
        '2027-01-09',
      );
    });
  });

  describe('reference date is paidAt', () => {
    it('a grace-day payment confirmed after the block still starts at accessEndsAt', () => {
      // Paid on 16 Dec, the admin confirms on 22 Dec: only paidAt matters.
      const s = sub();
      expect(
        BillingPeriodCalculator.periodStart(
          s,
          graceEndsAt(s),
          at('2026-12-16T12:00:00'),
        ),
      ).toEqual(at('2026-12-14'));
    });

    it('a payment exactly at graceEndsAt counts from the day of payment', () => {
      const s = sub();
      expect(
        BillingPeriodCalculator.periodStart(
          s,
          graceEndsAt(s),
          at('2026-12-17'),
        ),
      ).toEqual(at('2026-12-17'));
    });

    it('a payment just before graceEndsAt counts from accessEndsAt', () => {
      const s = sub();
      expect(
        BillingPeriodCalculator.periodStart(
          s,
          graceEndsAt(s),
          at('2026-12-16T23:59:59'),
        ),
      ).toEqual(at('2026-12-14'));
    });
  });

  describe('billing period length', () => {
    it('YEAR is 12 months', () => {
      expect(BillingPeriodCalculator.months(BillingPeriod.YEAR)).toBe(12);
      expect(BillingPeriodCalculator.months(BillingPeriod.MONTH)).toBe(1);
      const r = pay(sub(), at('2026-12-05'), BillingPeriod.YEAR);
      expect(r.periodStart).toEqual(at('2026-12-14'));
      expect(r.periodEnd).toEqual(at('2027-12-14'));
    });
  });

  describe('anchor day (plan 2.4)', () => {
    it('anchor 31: 31 Jan → 28 Feb → 31 Mar → 30 Apr', () => {
      let s = sub({
        trialEndsAt: at('2027-01-31'),
        accessEndsAt: at('2027-01-31'),
      });
      const ends: Date[] = [];
      for (let i = 0; i < 3; i++) {
        const { r, next } = applied(s, at('2027-01-20'));
        ends.push(r.periodEnd);
        expect(r.anchorDay).toBe(31);
        s = next;
      }
      expect(ends).toEqual([
        at('2027-02-28'),
        at('2027-03-31'),
        at('2027-04-30'),
      ]);
    });

    it('yearly anchor 29 Feb: 29 Feb → 28 Feb in common years → 29 Feb in the next leap year', () => {
      let s = sub({
        trialEndsAt: at('2028-02-29'),
        accessEndsAt: at('2028-02-29'),
      });
      const ends: Date[] = [];
      for (let i = 0; i < 4; i++) {
        const { r, next } = applied(s, at('2028-02-01'), BillingPeriod.YEAR);
        ends.push(r.periodEnd);
        expect(r.anchorDay).toBe(29);
        s = next;
      }
      expect(ends).toEqual([
        at('2029-02-28'),
        at('2030-02-28'),
        at('2031-02-28'),
        at('2032-02-29'),
      ]);
    });

    it('is kept when the payment continues the chain', () => {
      const s = sub({
        trialEndsAt: at('2026-12-14'),
        paidUntil: at('2027-02-28'),
        accessEndsAt: at('2027-02-28'),
        billingAnchorDay: 31,
      });
      const r = pay(s, at('2027-02-20'));
      expect(r.periodStart).toEqual(at('2027-02-28'));
      expect(r.anchorDay).toBe(31);
      expect(r.periodEnd).toEqual(at('2027-03-31'));
    });

    it('is set to the start day on the first payment', () => {
      const s = sub({
        trialEndsAt: at('2027-01-31'),
        accessEndsAt: at('2027-01-31'),
      });
      expect(pay(s, at('2027-01-10')).anchorDay).toBe(31);
    });

    it('is reset after the block', () => {
      const s = sub({
        paidUntil: at('2027-01-31'),
        accessEndsAt: at('2027-01-31'),
        billingAnchorDay: 31,
      });
      const r = pay(s, at('2027-02-05T13:00:00'));
      expect(r.periodStart).toEqual(at('2027-02-05'));
      expect(r.anchorDay).toBe(5);
      expect(r.periodEnd).toEqual(at('2027-03-05'));
    });

    it('is reset after an extended trial', () => {
      // Paid until 14 Jan (anchor 14), then the admin extended the trial to 20 Jan.
      const s = sub({
        trialEndsAt: at('2027-01-20'),
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-20'),
        billingAnchorDay: 14,
      });
      const r = pay(s, at('2027-01-18'));
      expect(r.periodStart).toEqual(at('2027-01-20'));
      expect(r.anchorDay).toBe(20);
      expect(r.periodEnd).toEqual(at('2027-02-20'));
    });

    it('a plan change sets it to the day of the new paidUntil, and the next payment keeps it', () => {
      // After a 4.4 conversion paidUntil moved to 24 Jan; the anchor follows it.
      const s = sub({
        paidUntil: at('2027-01-24'),
        accessEndsAt: at('2027-01-24'),
        billingAnchorDay: 24,
      });
      const r = pay(s, at('2027-01-20'));
      expect(r.periodStart).toEqual(at('2027-01-24'));
      expect(r.anchorDay).toBe(24);
      expect(r.periodEnd).toEqual(at('2027-02-24'));
    });
  });

  describe('periods end at local midnight in every zone', () => {
    it.each(['Europe/Moscow', 'Asia/Almaty', 'Asia/Aqtobe', 'Europe/Warsaw'])(
      '%s',
      (tz) => {
        const s = sub({
          timezone: tz,
          trialEndsAt: at('2027-03-15', tz),
          accessEndsAt: at('2027-03-15', tz),
        });
        const { r, next } = applied(s, at('2027-03-10T12:00:00', tz));
        expect(r.periodStart).toEqual(at('2027-03-15', tz));
        expect(r.periodEnd).toEqual(at('2027-04-15', tz));
        const parts = TimeUtils.toZonedParts(r.periodEnd, tz);
        expect([parts.hour, parts.minute, parts.second]).toEqual([0, 0, 0]);
        expect(SubscriptionStateCalculator.lastDayBefore(r.periodEnd, tz)).toBe(
          '2027-04-14',
        );

        // After the block the start is the local day of payment, at local midnight.
        const late = pay(next, at('2027-04-25T00:30:00', tz));
        expect(late.periodStart).toEqual(at('2027-04-25', tz));
      },
    );
  });

  describe('complimentaryPeriod', () => {
    it('extends from accessEndsAt by days and anchors to the new end', () => {
      const s = sub();
      const r = BillingPeriodCalculator.complimentaryPeriod(
        s,
        graceEndsAt(s),
        at('2026-12-01'),
        {
          days: 10,
        },
      );
      expect(r.periodStart).toEqual(at('2026-12-14'));
      expect(r.periodEnd).toEqual(at('2026-12-24'));
      expect(r.anchorDay).toBe(24);
    });

    it('starts on the current day after the block and can run until a date', () => {
      const s = sub();
      const r = BillingPeriodCalculator.complimentaryPeriod(
        s,
        graceEndsAt(s),
        at('2026-12-20T10:00:00'),
        { until: at('2027-01-05') },
      );
      expect(r.periodStart).toEqual(at('2026-12-20'));
      expect(r.periodEnd).toEqual(at('2027-01-05'));
      expect(r.anchorDay).toBe(5);
    });
  });
});
