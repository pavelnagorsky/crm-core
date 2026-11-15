import { BillingSettings } from '@prisma/client';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { PaymentProjectionInput } from '../interfaces/payment-projection-input.interface.js';
import { PaymentProjection } from '../interfaces/payment-projection.interface.js';
import { RemainderConversion } from '../interfaces/remainder-conversion.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';
import { AccessDatesCalculator } from './access-dates.calculator.js';
import { BillingPeriodCalculator } from './billing-period.calculator.js';
import { PlanConversionCalculator } from './plan-conversion.calculator.js';
import { SubscriptionStateCalculator } from './subscription-state.calculator.js';

type ProjectionSettings = Pick<
  BillingSettings,
  'graceDays' | 'defaultCountryCode'
>;

/**
 * What a payment does to a subscription (plan sections 4.3, 4.4), without writing:
 * a paid remainder of another plan is converted first, then the period is added.
 */
export class PaymentProjectionCalculator {
  private constructor() {}

  static project(
    subscription: SubscriptionWithPlan,
    payment: PaymentProjectionInput,
    plans: readonly BillingPlanWithPrices[],
    settings: ProjectionSettings,
    now: Date,
  ): PaymentProjection {
    const { current, convertedPaidUntil, conversionFailed } =
      PaymentProjectionCalculator.convertRemainder(
        subscription,
        payment,
        plans,
        settings,
        now,
      );
    const graceEndsAt = SubscriptionStateCalculator.graceEndsAt(
      current,
      settings.graceDays,
    );
    const period = payment.complimentary
      ? BillingPeriodCalculator.complimentaryPeriod(
          current,
          graceEndsAt,
          now,
          payment.complimentary,
        )
      : BillingPeriodCalculator.paidPeriod(
          current,
          graceEndsAt,
          payment.paidAt,
          payment.billingPeriod,
        );
    return { period, convertedPaidUntil, conversionFailed };
  }

  /** The subscription as it is once the paid remainder moved to the payment plan. */
  private static convertRemainder(
    subscription: SubscriptionWithPlan,
    payment: PaymentProjectionInput,
    plans: readonly BillingPlanWithPrices[],
    settings: ProjectionSettings,
    now: Date,
  ): RemainderConversion {
    const needsConversion =
      !!subscription.plan &&
      subscription.planId !== payment.plan?.id &&
      PlanConversionCalculator.hasPaidRemainder(subscription, now);
    if (!needsConversion)
      return {
        current: subscription,
        convertedPaidUntil: null,
        conversionFailed: false,
      };
    const convertedPaidUntil = payment.plan
      ? PlanConversionCalculator.convertedPaidUntil(
          subscription,
          payment.plan,
          subscription,
          plans,
          settings.defaultCountryCode,
          now,
        )
      : null;
    if (!convertedPaidUntil)
      return {
        current: subscription,
        convertedPaidUntil: null,
        conversionFailed: true,
      };
    return {
      current: {
        ...subscription,
        ...AccessDatesCalculator.paidThrough(subscription, convertedPaidUntil),
      },
      convertedPaidUntil,
      conversionFailed: false,
    };
  }
}
