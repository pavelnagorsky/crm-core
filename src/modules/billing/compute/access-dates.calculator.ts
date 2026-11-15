import { Subscription } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PaidThroughDates } from '../interfaces/paid-through-dates.interface.js';

/** Dates that follow from the trial end and the paid end (plan section 2.4). */
export class AccessDatesCalculator {
  private constructor() {}

  /** Access lasts while the trial or the paid period does. */
  static accessEndsAt(trialEndsAt: Date, paidUntil: Date | null): Date {
    return paidUntil && paidUntil > trialEndsAt ? paidUntil : trialEndsAt;
  }

  /** Paid until the given moment; the next period is anchored on its local day. */
  static paidThrough(
    subscription: Pick<Subscription, 'trialEndsAt' | 'timezone'>,
    paidUntil: Date,
  ): PaidThroughDates {
    return {
      paidUntil,
      accessEndsAt: AccessDatesCalculator.accessEndsAt(
        subscription.trialEndsAt,
        paidUntil,
      ),
      billingAnchorDay: TimeUtils.toZonedParts(paidUntil, subscription.timezone)
        .day,
    };
  }
}
