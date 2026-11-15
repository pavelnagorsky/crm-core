import { BillingPeriod, Subscription } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { BillingPeriodResult } from '../interfaces/billing-period-result.interface.js';

type PeriodSubscription = Pick<
  Subscription,
  'timezone' | 'accessEndsAt' | 'paidUntil' | 'billingAnchorDay'
>;

/** Pure rules of plan sections 2.4 and 4.3. */
export class BillingPeriodCalculator {
  private constructor() {}

  static months(period: BillingPeriod): number {
    return period === BillingPeriod.YEAR ? 12 : 1;
  }

  /** 00:00 of the local day that contains `date`. */
  static dayStart(date: Date, timezone: string): Date {
    const p = TimeUtils.toZonedParts(date, timezone);
    return TimeUtils.zonedDayStart(p.year, p.month, p.day, timezone);
  }

  /**
   * Grace days are a deferral: a payment made before grace ends continues from
   * accessEndsAt. After the block it starts on the local day of payment.
   */
  static periodStart(
    subscription: Pick<Subscription, 'timezone' | 'accessEndsAt'>,
    graceEndsAt: Date,
    paidAt: Date,
  ): Date {
    return paidAt < graceEndsAt
      ? subscription.accessEndsAt
      : BillingPeriodCalculator.dayStart(paidAt, subscription.timezone);
  }

  /** The anchor survives only when the payment continues the paid chain. */
  static anchorDay(subscription: PeriodSubscription, start: Date): number {
    const continues =
      subscription.paidUntil !== null &&
      subscription.billingAnchorDay !== null &&
      subscription.paidUntil.getTime() === start.getTime();
    return continues
      ? subscription.billingAnchorDay!
      : TimeUtils.toZonedParts(start, subscription.timezone).day;
  }

  static paidPeriod(
    subscription: PeriodSubscription,
    graceEndsAt: Date,
    paidAt: Date,
    period: BillingPeriod,
  ): BillingPeriodResult {
    const periodStart = BillingPeriodCalculator.periodStart(
      subscription,
      graceEndsAt,
      paidAt,
    );
    const anchorDay = BillingPeriodCalculator.anchorDay(
      subscription,
      periodStart,
    );
    return {
      periodStart,
      periodEnd: TimeUtils.addMonthsAnchoredInTz(
        periodStart,
        BillingPeriodCalculator.months(period),
        anchorDay,
        subscription.timezone,
      ),
      anchorDay,
    };
  }

  /**
   * Extension without payment: same start rule, a free length. The anchor moves to
   * the new end so the next paid month stays a full month.
   */
  static complimentaryPeriod(
    subscription: PeriodSubscription,
    graceEndsAt: Date,
    now: Date,
    length: { days: number } | { until: Date },
  ): BillingPeriodResult {
    const periodStart = BillingPeriodCalculator.periodStart(
      subscription,
      graceEndsAt,
      now,
    );
    const periodEnd =
      'days' in length
        ? TimeUtils.addDaysInTz(periodStart, length.days, subscription.timezone)
        : length.until;
    return {
      periodStart,
      periodEnd,
      anchorDay: TimeUtils.toZonedParts(periodEnd, subscription.timezone).day,
    };
  }
}
