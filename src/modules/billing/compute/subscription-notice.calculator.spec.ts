import { SubscriptionNoticeKind } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { SubscriptionDates } from '../interfaces/subscription-dates.interface.js';
import { SubscriptionNoticeCalculator } from './subscription-notice.calculator.js';

const TZ = 'Europe/Minsk';
const at = (local: string, tz = TZ): Date =>
  TimeUtils.localToUtc(local.length === 10 ? `${local}T00:00:00` : local, tz);

const settings = {
  graceDays: 3,
  reminderDaysBefore: [7, 3, 1],
  enforcementEnabled: true,
};

/** Trial until 13 Dec inclusive. */
const trial = (
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

const due = (dates: SubscriptionDates, now: string, s = settings) =>
  SubscriptionNoticeCalculator.due(dates, s, at(now, dates.timezone));

const { TRIAL_ENDING, PERIOD_ENDING, ACCESS_ENDED, ACCESS_LIMITED } =
  SubscriptionNoticeKind;

describe('SubscriptionNoticeCalculator (plan 9.1)', () => {
  describe('reminders before accessEndsAt', () => {
    it('nothing before the first threshold', () => {
      expect(due(trial(), '2026-12-01T10:00:00')).toBeNull();
    });

    it('fires at 10:00 local time, not earlier', () => {
      expect(due(trial(), '2026-12-07T09:59:59')).toBeNull();
      expect(due(trial(), '2026-12-07T10:00:00')).toEqual({
        kind: TRIAL_ENDING,
        anchorAt: at('2026-12-14'),
        daysBefore: 7,
      });
    });

    it('uses the local zone of the subscription', () => {
      const almaty = trial({
        timezone: 'Asia/Almaty',
        trialEndsAt: at('2026-12-14', 'Asia/Almaty'),
        accessEndsAt: at('2026-12-14', 'Asia/Almaty'),
      });
      expect(due(almaty, '2026-12-07T09:59:00')).toBeNull();
      expect(due(almaty, '2026-12-07T10:00:00')?.daysBefore).toBe(7);
    });

    it('when several thresholds have passed, only the nearest is due', () => {
      expect(due(trial(), '2026-12-11T10:00:00')?.daysBefore).toBe(3);
      expect(due(trial(), '2026-12-13T12:00:00')).toEqual({
        kind: TRIAL_ENDING,
        anchorAt: at('2026-12-14'),
        daysBefore: 1,
      });
    });

    it('is PERIOD_ENDING when access ends with a payment', () => {
      const paid = trial({
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-14'),
      });
      expect(due(paid, '2027-01-07T10:00:00')).toEqual({
        kind: PERIOD_ENDING,
        anchorAt: at('2027-01-14'),
        daysBefore: 7,
      });
    });

    it('is TRIAL_ENDING when the payment ended inside an extended trial', () => {
      const dates = trial({
        trialEndsAt: at('2027-01-20'),
        paidUntil: at('2027-01-14'),
        accessEndsAt: at('2027-01-20'),
      });
      expect(due(dates, '2027-01-17T10:00:00')?.kind).toBe(TRIAL_ENDING);
    });

    it('moves anchorAt after an extension, so reminders are counted again', () => {
      const before = due(trial(), '2026-12-13T12:00:00');
      const extended = trial({
        trialEndsAt: at('2026-12-28'),
        accessEndsAt: at('2026-12-28'),
      });
      expect(due(extended, '2026-12-13T12:00:00')).toBeNull();
      const after = due(extended, '2026-12-21T10:00:00');
      expect(after).toEqual({
        kind: TRIAL_ENDING,
        anchorAt: at('2026-12-28'),
        daysBefore: 7,
      });
      expect(after?.anchorAt).not.toEqual(before?.anchorAt);
    });

    it('ignores non-positive and duplicate thresholds', () => {
      const s = { ...settings, reminderDaysBefore: [3, 3, 0, -1] };
      expect(due(trial(), '2026-12-11T10:00:00', s)?.daysBefore).toBe(3);
      expect(due(trial(), '2026-12-13T23:00:00', s)?.daysBefore).toBe(3);
    });
  });

  describe('ACCESS_ENDED', () => {
    it('fires at 10:00 on the day of accessEndsAt', () => {
      expect(due(trial(), '2026-12-14T09:00:00')).toBeNull();
      expect(due(trial(), '2026-12-14T10:00:00')).toEqual({
        kind: ACCESS_ENDED,
        anchorAt: at('2026-12-14'),
        daysBefore: 0,
      });
      expect(due(trial(), '2026-12-16T20:00:00')?.kind).toBe(ACCESS_ENDED);
    });
  });

  describe('ACCESS_LIMITED', () => {
    it('fires at 10:00 on the day of graceEndsAt, anchored to graceEndsAt', () => {
      expect(due(trial(), '2026-12-17T10:00:00')).toEqual({
        kind: ACCESS_LIMITED,
        anchorAt: at('2026-12-17'),
        daysBefore: 0,
      });
    });

    it('is not sent with enforcement off', () => {
      const off = { ...settings, enforcementEnabled: false };
      expect(due(trial(), '2026-12-17T10:00:00', off)).toBeNull();
      expect(due(trial(), '2026-12-16T10:00:00', off)?.kind).toBe(ACCESS_ENDED);
    });

    it('follows an extended grace period', () => {
      const dates = trial({ graceExtendedUntil: at('2026-12-20') });
      expect(due(dates, '2026-12-17T10:00:00')?.kind).toBe(ACCESS_ENDED);
      expect(due(dates, '2026-12-20T10:00:00')).toEqual({
        kind: ACCESS_LIMITED,
        anchorAt: at('2026-12-20'),
        daysBefore: 0,
      });
    });

    it('replaces ACCESS_ENDED when graceDays = 0', () => {
      const s = { ...settings, graceDays: 0 };
      expect(due(trial(), '2026-12-14T10:00:00', s)?.kind).toBe(ACCESS_LIMITED);
    });
  });

  it('SUSPENDED subscriptions get no notices', () => {
    const dates = trial({ suspendedAt: at('2026-12-01') });
    expect(due(dates, '2026-12-07T10:00:00')).toBeNull();
    expect(due(dates, '2026-12-14T10:00:00')).toBeNull();
    expect(due(dates, '2026-12-17T10:00:00')).toBeNull();
  });
});
