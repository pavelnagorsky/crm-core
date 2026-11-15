import { TimeUtils } from '../../../shared/time/time.utils.js';
import { SubscriptionState } from '../enums/subscription-state.enum.js';
import { SubscriptionDates } from '../interfaces/subscription-dates.interface.js';
import { SubscriptionStateCalculator } from './subscription-state.calculator.js';

const TZ = 'Europe/Minsk';
const GRACE_DAYS = 3;

/** Local wall-clock time in Minsk → UTC instant. */
const at = (local: string): Date =>
  TimeUtils.localToUtc(local.length === 10 ? `${local}T00:00:00` : local, TZ);

/** Trial created 14 Nov 2026 for 30 days: access until 13 Dec inclusive (plan 2.2). */
const trialDates = (
  overrides: Partial<SubscriptionDates> = {},
): SubscriptionDates => ({
  timezone: TZ,
  trialEndsAt: at('2026-12-14'),
  paidUntil: null,
  accessEndsAt: at('2026-12-14'),
  graceExtendedUntil: null,
  suspendedAt: null,
  ...overrides,
});

const state = (
  dates: SubscriptionDates | null,
  now: string,
  graceDays = GRACE_DAYS,
) => SubscriptionStateCalculator.state(dates, graceDays, at(now));

describe('SubscriptionStateCalculator', () => {
  describe('state (plan 2.1)', () => {
    it('is FREE without a subscription row', () => {
      expect(state(null, '2026-12-01T12:00:00')).toBe(SubscriptionState.FREE);
    });

    it('is TRIAL before trialEndsAt', () => {
      expect(state(trialDates(), '2026-11-14T09:00:00')).toBe(
        SubscriptionState.TRIAL,
      );
      expect(state(trialDates(), '2026-12-13T23:59:59')).toBe(
        SubscriptionState.TRIAL,
      );
    });

    it('is PAST_DUE exactly at accessEndsAt and through the grace days', () => {
      expect(state(trialDates(), '2026-12-14T00:00:00')).toBe(
        SubscriptionState.PAST_DUE,
      );
      expect(state(trialDates(), '2026-12-16T23:59:59')).toBe(
        SubscriptionState.PAST_DUE,
      );
    });

    it('is EXPIRED exactly at graceEndsAt', () => {
      expect(state(trialDates(), '2026-12-17T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
      expect(state(trialDates(), '2027-03-01T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('keeps TRIAL while the trial lasts after a payment, then ACTIVE until paidUntil', () => {
      const dates = trialDates({
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-14'),
      });
      expect(state(dates, '2026-12-05T12:00:00')).toBe(SubscriptionState.TRIAL);
      expect(state(dates, '2026-12-14T00:00:00')).toBe(
        SubscriptionState.ACTIVE,
      );
      expect(state(dates, '2027-01-13T23:59:59')).toBe(
        SubscriptionState.ACTIVE,
      );
      expect(state(dates, '2027-01-14T00:00:00')).toBe(
        SubscriptionState.PAST_DUE,
      );
      expect(state(dates, '2027-01-17T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('starts a brand without trial straight in PAST_DUE', () => {
      const dates = trialDates({
        trialEndsAt: at('2026-12-10'),
        accessEndsAt: at('2026-12-10'),
      });
      expect(state(dates, '2026-12-10T08:00:00')).toBe(
        SubscriptionState.PAST_DUE,
      );
      expect(state(dates, '2026-12-13T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('goes from access straight to EXPIRED with graceDays = 0', () => {
      expect(state(trialDates(), '2026-12-13T23:59:59', 0)).toBe(
        SubscriptionState.TRIAL,
      );
      expect(state(trialDates(), '2026-12-14T00:00:00', 0)).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('lets graceExtendedUntil push EXPIRED back', () => {
      const dates = trialDates({ graceExtendedUntil: at('2026-12-20') });
      expect(state(dates, '2026-12-17T00:00:00')).toBe(
        SubscriptionState.PAST_DUE,
      );
      expect(state(dates, '2026-12-19T23:59:59')).toBe(
        SubscriptionState.PAST_DUE,
      );
      expect(state(dates, '2026-12-20T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('ignores a graceExtendedUntil earlier than the regular grace end', () => {
      const dates = trialDates({ graceExtendedUntil: at('2026-12-15') });
      expect(state(dates, '2026-12-16T12:00:00')).toBe(
        SubscriptionState.PAST_DUE,
      );
    });

    it('does not unblock an EXPIRED subscription with an extension granted for an older cycle', () => {
      // graceExtendedUntil was granted for an earlier accessEndsAt and has already passed.
      const dates = trialDates({
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-14'),
        graceExtendedUntil: at('2026-12-20'),
      });
      expect(state(dates, '2027-01-17T00:00:00')).toBe(
        SubscriptionState.EXPIRED,
      );
    });

    it('is SUSPENDED regardless of dates', () => {
      const suspendedAt = at('2026-11-20');
      expect(state(trialDates({ suspendedAt }), '2026-11-21T00:00:00')).toBe(
        SubscriptionState.SUSPENDED,
      );
      expect(
        state(
          trialDates({
            suspendedAt,
            paidUntil: at('2027-12-14'),
            accessEndsAt: at('2027-12-14'),
          }),
          '2027-01-01T00:00:00',
        ),
      ).toBe(SubscriptionState.SUSPENDED);
      expect(state(trialDates({ suspendedAt }), '2027-03-01T00:00:00')).toBe(
        SubscriptionState.SUSPENDED,
      );
    });
  });

  describe('graceEndsAt', () => {
    it('is accessEndsAt + graceDays local days', () => {
      expect(SubscriptionStateCalculator.graceEndsAt(trialDates(), 3)).toEqual(
        at('2026-12-17'),
      );
      expect(SubscriptionStateCalculator.graceEndsAt(trialDates(), 0)).toEqual(
        at('2026-12-14'),
      );
    });

    it('takes the later of the regular end and graceExtendedUntil', () => {
      const extended = trialDates({ graceExtendedUntil: at('2026-12-20') });
      expect(SubscriptionStateCalculator.graceEndsAt(extended, 3)).toEqual(
        at('2026-12-20'),
      );
      expect(
        SubscriptionStateCalculator.regularGraceEndsAt(extended, 3),
      ).toEqual(at('2026-12-17'));
    });
  });

  describe('isBlocked', () => {
    it.each([
      [SubscriptionState.FREE, false],
      [SubscriptionState.TRIAL, false],
      [SubscriptionState.ACTIVE, false],
      [SubscriptionState.PAST_DUE, false],
      [SubscriptionState.EXPIRED, true],
      [SubscriptionState.SUSPENDED, true],
    ])('%s with enforcement → %s', (s, blocked) => {
      expect(SubscriptionStateCalculator.isBlocked(s, true)).toBe(blocked);
    });

    it('never blocks with enforcement off', () => {
      for (const s of Object.values(SubscriptionState))
        expect(SubscriptionStateCalculator.isBlocked(s, false)).toBe(false);
    });
  });

  describe('view', () => {
    const settings = { graceDays: GRACE_DAYS, enforcementEnabled: true };

    it('returns nothing but the state for FREE', () => {
      expect(
        SubscriptionStateCalculator.view(null, settings, at('2026-12-01')),
      ).toEqual({
        state: SubscriptionState.FREE,
        isBlocked: false,
        trialEndsAt: null,
        paidUntil: null,
        accessEndsAt: null,
        graceEndsAt: null,
        lastAccessDate: null,
        daysLeft: null,
      });
    });

    it('gives the last local day of access (plan 2.2)', () => {
      const view = SubscriptionStateCalculator.view(
        trialDates(),
        settings,
        at('2026-12-01'),
      );
      expect(view.lastAccessDate).toBe('2026-12-13');
      expect(view.graceEndsAt).toEqual(at('2026-12-17'));
    });

    it('counts days to accessEndsAt in TRIAL and ACTIVE', () => {
      expect(
        SubscriptionStateCalculator.view(
          trialDates(),
          settings,
          at('2026-12-10T22:00:00'),
        ).daysLeft,
      ).toBe(4);
      const paid = trialDates({
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-14'),
      });
      const view = SubscriptionStateCalculator.view(
        paid,
        settings,
        at('2027-01-04T10:00:00'),
      );
      expect(view.state).toBe(SubscriptionState.ACTIVE);
      expect(view.daysLeft).toBe(10);
      expect(view.lastAccessDate).toBe('2027-01-13');
    });

    it('counts days to graceEndsAt in PAST_DUE', () => {
      const view = SubscriptionStateCalculator.view(
        trialDates(),
        settings,
        at('2026-12-15T10:00:00'),
      );
      expect(view.state).toBe(SubscriptionState.PAST_DUE);
      expect(view.daysLeft).toBe(2);
    });

    it('has no daysLeft and is blocked in EXPIRED', () => {
      const view = SubscriptionStateCalculator.view(
        trialDates(),
        settings,
        at('2026-12-18'),
      );
      expect(view.state).toBe(SubscriptionState.EXPIRED);
      expect(view.isBlocked).toBe(true);
      expect(view.daysLeft).toBeNull();
    });

    it('is not blocked in EXPIRED with enforcement off', () => {
      const view = SubscriptionStateCalculator.view(
        trialDates(),
        { graceDays: GRACE_DAYS, enforcementEnabled: false },
        at('2026-12-18'),
      );
      expect(view.state).toBe(SubscriptionState.EXPIRED);
      expect(view.isBlocked).toBe(false);
    });
  });

  describe('calendarDaysBetween', () => {
    it('counts local calendar days, not 24h blocks', () => {
      expect(
        SubscriptionStateCalculator.calendarDaysBetween(
          at('2026-12-13T23:30:00'),
          at('2026-12-14T00:30:00'),
          TZ,
        ),
      ).toBe(1);
    });

    it('never goes negative', () => {
      expect(
        SubscriptionStateCalculator.calendarDaysBetween(
          at('2026-12-20'),
          at('2026-12-14'),
          TZ,
        ),
      ).toBe(0);
    });
  });
});
