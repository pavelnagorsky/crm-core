import { Injectable } from '@nestjs/common';
import { SubscriptionEvent, SubscriptionPayment } from '@prisma/client';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { SubscriptionEventsRequestDto } from '../../dto/subscription-events-request.dto.js';
import { SubscriptionPaymentsRequestDto } from '../../dto/subscription-payments-request.dto.js';
import { BrandSubscriptionDetails } from '../../interfaces/brand-subscription-details.interface.js';
import { PaymentWithNextAction } from '../../interfaces/payment-with-next-action.interface.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import { SubscriptionEventService } from '../../subscriptions/services/subscription-event.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';
import { PaymentNextActionService } from './payment-next-action.service.js';

/** The owner billing screen: state, usage, payment history and events (plan section 8.2). */
@Injectable()
export class BrandSubscriptionQueryService {
  constructor(
    private readonly access: SubscriptionAccessService,
    private readonly payments: SubscriptionPaymentService,
    private readonly subscriptionEvents: SubscriptionEventService,
    private readonly plans: BillingPlanService,
    private readonly usage: BillingUsageService,
    private readonly nextActions: PaymentNextActionService,
  ) {}

  async details(
    brandId: string,
    now = new Date(),
  ): Promise<BrandSubscriptionDetails> {
    const [state, usage, plans] = await Promise.all([
      this.access.state(brandId, now),
      this.usage.usage(brandId),
      this.plans.findAllCached(),
    ]);
    const subscription = state.snapshot.subscription;
    const defaultCountry = state.settings.defaultCountryCode;
    const countryCode = subscription?.countryCode ?? defaultCountry;
    const pricingCountry = PricingCountryResolver.pricingCountry(
      plans,
      countryCode,
      defaultCountry,
      now,
    );
    const needsCustomPlan =
      !!subscription &&
      EffectiveLimitsCalculator.needsCustomPlan(
        subscription.plan,
        await this.access.selfServePlans(countryCode, now),
        usage,
      );
    return {
      ...state,
      pricingCountry,
      currency: PricingCountryResolver.currency(plans, pricingCountry),
      usage,
      overLimit: EffectiveLimitsCalculator.isOverLimit(state.limits, usage),
      needsCustomPlan,
    };
  }

  paymentHistory(
    brandId: string,
    dto: SubscriptionPaymentsRequestDto,
  ): Promise<PaginatedResult<SubscriptionPayment>> {
    return this.payments.searchForBrand(brandId, dto);
  }

  async findPayment(
    brandId: string,
    paymentId: string,
  ): Promise<PaymentWithNextAction> {
    const payment = await this.payments.findForBrand(brandId, paymentId);
    return { payment, nextAction: await this.nextActions.forPayment(payment) };
  }

  async events(
    brandId: string,
    dto: SubscriptionEventsRequestDto,
  ): Promise<PaginatedResult<SubscriptionEvent>> {
    const { subscription } = await this.access.snapshot(brandId);
    if (!subscription) return { items: [], totalItems: 0 };
    return this.subscriptionEvents.search(subscription.id, dto);
  }
}
