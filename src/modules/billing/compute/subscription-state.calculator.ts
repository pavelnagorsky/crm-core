import { BillingSettings } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { SubscriptionState } from '../enums/subscription-state.enum.js';
import { SubscriptionDates } from '../interfaces/subscription-dates.interface.js';
import { SubscriptionStateView } from '../interfaces/subscription-state-view.interface.js';

type StateSettings = Pick<BillingSettings, 'graceDays' | 'enforcementEnabled'>;

const DAY_MS = 86_400_000;

/** Pure rules of plan section 2.1. State is never stored, only computed for `now`. */
export class SubscriptionStateCalculator {
  private constructor() {}

  /** max(accessEndsAt + graceDays local days, graceExtendedUntil). */
  static graceEndsAt(dates: SubscriptionDates, graceDays: number): Date {
    const regular = SubscriptionStateCalculator.regularGraceEndsAt(
      dates,
      graceDays,
    );
    return dates.graceExtendedUntil && dates.graceExtendedUntil > regular
      ? dates.graceExtendedUntil
      : regular;
  }

  /** Grace end without the extension a pending request grants. */
  static regularGraceEndsAt(dates: SubscriptionDates, graceDays: number): Date {
    return TimeUtils.addDaysInTz(dates.accessEndsAt, graceDays, dates.timezone);
  }

  static state(
    dates: SubscriptionDates | null,
    graceDays: number,
    now: Date,
  ): SubscriptionState {
    if (!dates) return SubscriptionState.FREE;
    if (dates.suspendedAt) return SubscriptionState.SUSPENDED;
    if (now < dates.trialEndsAt) return SubscriptionState.TRIAL;
    if (now < dates.accessEndsAt) return SubscriptionState.ACTIVE;
    if (now < SubscriptionStateCalculator.graceEndsAt(dates, graceDays))
      return SubscriptionState.PAST_DUE;
    return SubscriptionState.EXPIRED;
  }

  static isBlocked(state: SubscriptionState, enforcementEnabled: boolean) {
    return (
      enforcementEnabled &&
      (state === SubscriptionState.EXPIRED ||
        state === SubscriptionState.SUSPENDED)
    );
  }

  static view(
    dates: SubscriptionDates | null,
    settings: StateSettings,
    now: Date,
  ): SubscriptionStateView {
    const state = SubscriptionStateCalculator.state(
      dates,
      settings.graceDays,
      now,
    );
    if (!dates)
      return {
        state,
        isBlocked: false,
        trialEndsAt: null,
        paidUntil: null,
        accessEndsAt: null,
        graceEndsAt: null,
        lastAccessDate: null,
        daysLeft: null,
      };

    const graceEndsAt = SubscriptionStateCalculator.graceEndsAt(
      dates,
      settings.graceDays,
    );
    const daysLeftTarget =
      state === SubscriptionState.TRIAL || state === SubscriptionState.ACTIVE
        ? dates.accessEndsAt
        : state === SubscriptionState.PAST_DUE
          ? graceEndsAt
          : null;
    return {
      state,
      isBlocked: SubscriptionStateCalculator.isBlocked(
        state,
        settings.enforcementEnabled,
      ),
      trialEndsAt: dates.trialEndsAt,
      paidUntil: dates.paidUntil,
      accessEndsAt: dates.accessEndsAt,
      graceEndsAt,
      lastAccessDate: SubscriptionStateCalculator.lastDayBefore(
        dates.accessEndsAt,
        dates.timezone,
      ),
      daysLeft: daysLeftTarget
        ? SubscriptionStateCalculator.calendarDaysBetween(
            now,
            daysLeftTarget,
            dates.timezone,
          )
        : null,
    };
  }

  /** Local "YYYY-MM-DD" of the last day before an exclusive end at local midnight. */
  static lastDayBefore(end: Date, timezone: string): string {
    return TimeUtils.zonedDateStr(new Date(end.getTime() - 1), timezone);
  }

  /** Local calendar days from the day of `from` to the day of `to`; never negative. */
  static calendarDaysBetween(from: Date, to: Date, timezone: string): number {
    const day = (date: Date) => {
      const p = TimeUtils.toZonedParts(date, timezone);
      return Date.UTC(p.year, p.month - 1, p.day);
    };
    return Math.max(0, Math.round((day(to) - day(from)) / DAY_MS));
  }
}
