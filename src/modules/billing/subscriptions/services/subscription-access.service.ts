import { Injectable } from '@nestjs/common';
import { BillingPlanStatus, BillingSettings } from '@prisma/client';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { SUBSCRIPTION_STATE_CACHE } from '../../cache/subscription-state.cache.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { SubscriptionStateCalculator } from '../../compute/subscription-state.calculator.js';
import { SubscriptionState } from '../../enums/subscription-state.enum.js';
import { BillingPlanWithPrices } from '../../interfaces/billing-plan-with-prices.interface.js';
import { BrandBillingState } from '../../interfaces/brand-billing-state.interface.js';
import { EffectiveLimits } from '../../interfaces/effective-limits.interface.js';
import { PricingCatalog } from '../../interfaces/pricing-catalog.interface.js';
import { SubscriptionSnapshot } from '../../interfaces/subscription-snapshot.interface.js';
import { SubscriptionStateView } from '../../interfaces/subscription-state-view.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';
import { SubscriptionService } from './subscription.service.js';

/** Read side: brand state from the cache, computed for the given moment. */
@Injectable()
export class SubscriptionAccessService {
  constructor(
    private readonly cache: AppCacheService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
    private readonly subscriptions: SubscriptionService,
    private readonly payments: SubscriptionPaymentService,
  ) {}

  snapshot(brandId: string): Promise<SubscriptionSnapshot> {
    return this.cache.getOrLoad(
      SUBSCRIPTION_STATE_CACHE,
      { brandId },
      async () => {
        const [subscription, pendingPayment] = await Promise.all([
          this.subscriptions.findByBrand(brandId),
          this.payments.findPendingByBrand(brandId),
        ]);
        return { subscription, pendingPayment };
      },
    );
  }

  async state(brandId: string, now = new Date()): Promise<BrandBillingState> {
    const [snapshot, settings] = await Promise.all([
      this.snapshot(brandId),
      this.settings.get(),
    ]);
    return this.compose(snapshot, settings, now);
  }

  compose(
    snapshot: SubscriptionSnapshot,
    settings: BillingSettings,
    now: Date,
  ): BrandBillingState {
    const view = SubscriptionStateCalculator.view(
      snapshot.subscription,
      settings,
      now,
    );
    return {
      snapshot,
      settings,
      view,
      limits: this.limits(snapshot, settings, view),
    };
  }

  /**
   * Limits that apply now. A trial gives the whole product even when a plan was
   * already paid for; the paid limits start with the paid period.
   */
  limits(
    snapshot: SubscriptionSnapshot,
    settings: Pick<BillingSettings, 'enforcementEnabled'>,
    view: Pick<SubscriptionStateView, 'state'>,
  ): EffectiveLimits {
    if (
      !settings.enforcementEnabled ||
      !snapshot.subscription ||
      view.state === SubscriptionState.TRIAL
    )
      return EffectiveLimitsCalculator.unlimited();
    return EffectiveLimitsCalculator.compute(snapshot.subscription);
  }

  async isOnlineBookingOpen(
    brandId: string,
    now = new Date(),
  ): Promise<boolean> {
    const { view } = await this.state(brandId, now);
    return !view.isBlocked;
  }

  /** Public catalog: active public plans, prices of the pricing country. */
  async catalog(
    countryCode: string | undefined,
    now = new Date(),
  ): Promise<PricingCatalog> {
    const [plans, settings] = await Promise.all([
      this.plans.findAllCached(),
      this.settings.get(),
    ]);
    const visible = plans.filter(
      (p) => p.status === BillingPlanStatus.ACTIVE && p.isPublic,
    );
    return PricingCountryResolver.catalog(
      visible,
      (countryCode ?? settings.defaultCountryCode).toUpperCase(),
      settings.defaultCountryCode,
      now,
    );
  }

  /** Plans an owner can buy in this country today, by position. */
  async selfServePlans(
    countryCode: string,
    now = new Date(),
  ): Promise<BillingPlanWithPrices[]> {
    const [plans, settings] = await Promise.all([
      this.plans.findAllCached(),
      this.settings.get(),
    ]);
    const pricingCountry = PricingCountryResolver.pricingCountry(
      plans,
      countryCode,
      settings.defaultCountryCode,
      now,
    );
    return plans
      .filter(
        (plan) =>
          EffectiveLimitsCalculator.isSelfServe(plan) &&
          PricingCountryResolver.periodPrices(plan, pricingCountry, now) !==
            null,
      )
      .sort((a, b) => a.position - b.position);
  }
}
