import { Injectable } from '@nestjs/common';
import { SubscriptionPayment } from '@prisma/client';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { PaymentProjectionCalculator } from '../../compute/payment-projection.calculator.js';
import { PlanOfferResolver } from '../../compute/plan-offer.resolver.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { CreateSubscriptionPaymentDto } from '../../dto/create-subscription-payment.dto.js';
import { PaymentQuoteRequestDto } from '../../dto/payment-quote-request.dto.js';
import { PaymentQuote } from '../../interfaces/payment-quote.interface.js';
import { PaymentWithNextAction } from '../../interfaces/payment-with-next-action.interface.js';
import { PaymentMailService } from '../../mail/services/payment-mail.service.js';
import { PaymentRequestService } from '../../payments/services/payment-request.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';
import { BrandQuoteContextService } from './brand-quote-context.service.js';
import { PaymentNextActionService } from './payment-next-action.service.js';

/** Owner renewal requests (plan section 4.2): quote, request, cancel. */
@Injectable()
export class BrandPaymentRequestService {
  constructor(
    private readonly context: BrandQuoteContextService,
    private readonly subscriptions: SubscriptionService,
    private readonly access: SubscriptionAccessService,
    private readonly requests: PaymentRequestService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
    private readonly usage: BillingUsageService,
    private readonly nextActions: PaymentNextActionService,
    private readonly paymentMail: PaymentMailService,
  ) {}

  /** What a payment made today buys (plan sections 4.2, 4.3). */
  async quote(
    brandId: string,
    dto: PaymentQuoteRequestDto,
    now = new Date(),
  ): Promise<PaymentQuote> {
    const { state, subscription, usage, plans } = await this.context.load(
      brandId,
      now,
    );
    const offer = PlanOfferResolver.offer(
      subscription,
      dto.planCode,
      dto.billingPeriod,
      plans,
      state.settings.defaultCountryCode,
      now,
    );
    const { period } = PaymentProjectionCalculator.project(
      subscription,
      { plan: offer.plan, billingPeriod: dto.billingPeriod, paidAt: now },
      plans,
      state.settings,
      now,
    );
    const fits = EffectiveLimitsCalculator.fits(offer.limits, usage);
    return {
      plan: offer.plan,
      billingPeriod: dto.billingPeriod,
      price: offer.price,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      limits: offer.limits,
      usage,
      fits,
      allowed: fits || state.view.isBlocked,
    };
  }

  async request(
    brandId: string,
    dto: CreateSubscriptionPaymentDto,
    userId: string,
    now = new Date(),
  ): Promise<PaymentWithNextAction> {
    const actor = BillingActors.owner(userId);
    const [usage, plans] = await Promise.all([
      this.usage.usage(brandId),
      this.plans.findAllCached(),
    ]);
    const payment = await this.subscriptions.withLock(
      brandId,
      async (subscription, tx) => {
        const settings = await this.settings.read(tx);
        const offer = PlanOfferResolver.offer(
          subscription,
          dto.planCode,
          dto.billingPeriod,
          plans,
          settings.defaultCountryCode,
          now,
        );
        const { view } = this.access.compose(
          { subscription, pendingPayment: null },
          settings,
          now,
        );
        // A blocked brand cannot remove staff, so it may pay and land over the limit (5.4).
        if (!view.isBlocked) this.usage.assertFits(offer.limits, usage);
        return this.requests.create(
          subscription,
          {
            plan: offer.plan,
            billingPeriod: dto.billingPeriod,
            price: offer.price,
            comment: dto.comment ?? null,
            actor,
          },
          tx,
          now,
        );
      },
    );
    const nextAction = await this.nextActions.forPayment(payment);
    await this.paymentMail.requested(payment, nextAction, userId);
    return { payment, nextAction };
  }

  cancel(
    brandId: string,
    paymentId: string,
    userId: string,
  ): Promise<SubscriptionPayment> {
    return this.requests.cancel(paymentId, BillingActors.owner(userId), {
      brandId,
    });
  }
}
