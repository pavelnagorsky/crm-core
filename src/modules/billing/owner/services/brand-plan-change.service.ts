import { HttpStatus, Injectable } from '@nestjs/common';
import { BillingPeriod } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { PlanConversionCalculator } from '../../compute/plan-conversion.calculator.js';
import { PlanOfferResolver } from '../../compute/plan-offer.resolver.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { PlanChangeRequestDto } from '../../dto/plan-change-request.dto.js';
import { BrandSubscriptionDetails } from '../../interfaces/brand-subscription-details.interface.js';
import { PlanChangeQuote } from '../../interfaces/plan-change-quote.interface.js';
import { PaymentRequestService } from '../../payments/services/payment-request.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { SubscriptionPlanService } from '../../subscriptions/services/subscription-plan.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';
import { BrandQuoteContextService } from './brand-quote-context.service.js';
import { BrandSubscriptionQueryService } from './brand-subscription-query.service.js';

/** Owner plan change with a paid remainder, converted by daily prices (plan section 4.4). */
@Injectable()
export class BrandPlanChangeService {
  constructor(
    private readonly context: BrandQuoteContextService,
    private readonly subscriptions: SubscriptionService,
    private readonly subscriptionPlans: SubscriptionPlanService,
    private readonly requests: PaymentRequestService,
    private readonly plans: BillingPlanService,
    private readonly usage: BillingUsageService,
    private readonly query: BrandSubscriptionQueryService,
  ) {}

  async quote(
    brandId: string,
    dto: PlanChangeRequestDto,
    now = new Date(),
  ): Promise<PlanChangeQuote> {
    const { state, subscription, usage, plans } = await this.context.load(
      brandId,
      now,
    );
    const plan = PlanOfferResolver.changeTarget(
      subscription,
      dto.planCode,
      plans,
      now,
    );
    const paidUntilAfter = PlanConversionCalculator.convertedPaidUntil(
      subscription,
      plan,
      { ...subscription, planId: plan.id },
      plans,
      state.settings.defaultCountryCode,
      now,
    );
    if (!paidUntilAfter)
      throw new AppException(
        ErrorCode.BILLING_PLAN_PRICE_MISSING,
        HttpStatus.CONFLICT,
      );
    const limits = EffectiveLimitsCalculator.compute({ ...subscription, plan });
    return {
      plan,
      billingPeriod: subscription.billingPeriod ?? BillingPeriod.MONTH,
      paidUntilBefore: subscription.paidUntil!,
      paidUntilAfter,
      limits,
      usage,
      fits: EffectiveLimitsCalculator.fits(limits, usage),
    };
  }

  async change(
    brandId: string,
    dto: PlanChangeRequestDto,
    userId: string,
    now = new Date(),
  ): Promise<BrandSubscriptionDetails> {
    const actor = BillingActors.owner(userId);
    const [usage, plans] = await Promise.all([
      this.usage.usage(brandId),
      this.plans.findAllCached(),
    ]);
    await this.subscriptions.withLock(brandId, async (subscription, tx) => {
      const plan = PlanOfferResolver.changeTarget(
        subscription,
        dto.planCode,
        plans,
        now,
      );
      this.usage.assertFits(
        EffectiveLimitsCalculator.compute({ ...subscription, plan }),
        usage,
      );
      await this.requests.cancelPending(
        subscription,
        actor,
        'plan_changed',
        tx,
      );
      return this.subscriptionPlans.changePlan(
        subscription,
        plan,
        actor,
        tx,
        now,
      );
    });
    return this.query.details(brandId, now);
  }
}
