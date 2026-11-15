import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPeriod,
  BillingPlan,
  BillingPlanPricingMode,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { PlanOffer } from '../interfaces/plan-offer.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';
import { EffectiveLimitsCalculator } from './effective-limits.calculator.js';
import { PlanConversionCalculator } from './plan-conversion.calculator.js';
import { PricingCountryResolver } from './pricing-country.resolver.js';

/** Which plans an owner may pay for or switch to (plan sections 4.2, 4.4). */
export class PlanOfferResolver {
  private constructor() {}

  static byCode(
    plans: readonly BillingPlanWithPrices[],
    code: string,
  ): BillingPlanWithPrices {
    const plan = plans.find((p) => p.code === code);
    if (!plan) throw new NotFoundException('Billing plan not found');
    return plan;
  }

  /**
   * A self-serve plan, or the current CUSTOM plan with an individual price.
   * Limits: the custom limits of the subscription, else those of the plan.
   */
  static offer(
    subscription: SubscriptionWithPlan,
    planCode: string,
    period: BillingPeriod,
    plans: readonly BillingPlanWithPrices[],
    defaultCountryCode: string,
    now: Date,
  ): PlanOffer {
    const plan = PlanOfferResolver.byCode(plans, planCode);
    const currentCustom =
      plan.pricingMode === BillingPlanPricingMode.CUSTOM &&
      subscription.planId === plan.id;
    if (!EffectiveLimitsCalculator.isSelfServe(plan) && !currentCustom)
      throw new AppException(
        ErrorCode.BILLING_PLAN_NOT_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    const price = PricingCountryResolver.subscriptionPrice(
      subscription,
      plan,
      period,
      plans,
      defaultCountryCode,
      now,
    );
    if (!price)
      throw new AppException(
        ErrorCode.BILLING_PLAN_PRICE_MISSING,
        HttpStatus.CONFLICT,
      );
    return {
      plan,
      price,
      limits: EffectiveLimitsCalculator.compute({ ...subscription, plan }),
    };
  }

  /** Owner plan change: only from a standard plan, to another self-serve one, with a paid remainder. */
  static changeTarget(
    subscription: SubscriptionWithPlan,
    planCode: string,
    plans: readonly BillingPlanWithPrices[],
    now: Date,
  ): BillingPlan {
    if (subscription.plan?.pricingMode === BillingPlanPricingMode.CUSTOM)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT,
        HttpStatus.CONFLICT,
      );
    const plan = PlanOfferResolver.byCode(plans, planCode);
    if (plan.id === subscription.planId)
      throw new BadRequestException('The subscription is already on this plan');
    if (!EffectiveLimitsCalculator.isSelfServe(plan))
      throw new AppException(
        ErrorCode.BILLING_PLAN_NOT_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    if (
      !subscription.plan ||
      !PlanConversionCalculator.hasPaidRemainder(subscription, now)
    )
      throw new AppException(
        ErrorCode.SUBSCRIPTION_NO_PAID_PERIOD,
        HttpStatus.CONFLICT,
      );
    return plan;
  }
}
