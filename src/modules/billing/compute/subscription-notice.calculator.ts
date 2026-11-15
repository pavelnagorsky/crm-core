import { BillingSettings, SubscriptionNoticeKind } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { SubscriptionDates } from '../interfaces/subscription-dates.interface.js';
import { SubscriptionNoticeDue } from '../interfaces/subscription-notice-due.interface.js';
import { SubscriptionStateCalculator } from './subscription-state.calculator.js';

type NoticeSettings = Pick<
  BillingSettings,
  'graceDays' | 'reminderDaysBefore' | 'enforcementEnabled'
>;

interface Candidate extends SubscriptionNoticeDue {
  fireAt: Date;
  /** The notice is stale from this moment on. */
  validUntil: Date;
}

/** Local hour notices go out at. */
const SEND_HOUR = 10;

/** Pure rule of plan section 9.1: the nearest passed threshold, at 10:00 local time. */
export class SubscriptionNoticeCalculator {
  private constructor() {}

  /** Access ends with the trial when nothing was paid past it. */
  static endingKind(dates: SubscriptionDates): SubscriptionNoticeKind {
    return dates.paidUntil === null || dates.paidUntil <= dates.trialEndsAt
      ? SubscriptionNoticeKind.TRIAL_ENDING
      : SubscriptionNoticeKind.PERIOD_ENDING;
  }

  /** 10:00 of the local day `daysOffset` days after the local day of `date`. */
  static fireAt(date: Date, daysOffset: number, timezone: string): Date {
    const p = TimeUtils.toZonedParts(date, timezone);
    return TimeUtils.zonedHourStart(
      p.year,
      p.month,
      p.day + daysOffset,
      SEND_HOUR,
      timezone,
    );
  }

  static due(
    dates: SubscriptionDates,
    settings: NoticeSettings,
    now: Date,
  ): SubscriptionNoticeDue | null {
    if (dates.suspendedAt) return null;
    const tz = dates.timezone;
    const graceEndsAt = SubscriptionStateCalculator.graceEndsAt(
      dates,
      settings.graceDays,
    );
    const endingKind = SubscriptionNoticeCalculator.endingKind(dates);

    const candidates: Candidate[] = [
      ...new Set(settings.reminderDaysBefore.filter((days) => days > 0)),
    ].map((days) => ({
      kind: endingKind,
      anchorAt: dates.accessEndsAt,
      daysBefore: days,
      fireAt: SubscriptionNoticeCalculator.fireAt(
        dates.accessEndsAt,
        -days,
        tz,
      ),
      validUntil: dates.accessEndsAt,
    }));
    candidates.push({
      kind: SubscriptionNoticeKind.ACCESS_ENDED,
      anchorAt: dates.accessEndsAt,
      daysBefore: 0,
      fireAt: SubscriptionNoticeCalculator.fireAt(dates.accessEndsAt, 0, tz),
      validUntil: graceEndsAt,
    });
    if (settings.enforcementEnabled)
      candidates.push({
        kind: SubscriptionNoticeKind.ACCESS_LIMITED,
        anchorAt: graceEndsAt,
        daysBefore: 0,
        fireAt: SubscriptionNoticeCalculator.fireAt(graceEndsAt, 0, tz),
        validUntil: TimeUtils.addDaysInTz(graceEndsAt, 1, tz),
      });

    // Later candidates win ties: ACCESS_LIMITED replaces ACCESS_ENDED when graceDays = 0.
    let nearest: Candidate | null = null;
    for (const candidate of candidates) {
      if (candidate.fireAt > now) continue;
      if (!nearest || candidate.fireAt >= nearest.fireAt) nearest = candidate;
    }
    if (!nearest || now >= nearest.validUntil) return null;
    return {
      kind: nearest.kind,
      anchorAt: nearest.anchorAt,
      daysBefore: nearest.daysBefore,
    };
  }
}
