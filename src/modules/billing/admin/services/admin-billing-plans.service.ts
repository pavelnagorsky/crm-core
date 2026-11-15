import { Injectable } from '@nestjs/common';
import { BillingPlanPrice } from '@prisma/client';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { CreateBillingPlanDto } from '../../dto/create-billing-plan.dto.js';
import { UpdateBillingPlanDto } from '../../dto/update-billing-plan.dto.js';
import { AdminBillingPlan } from '../../interfaces/admin-billing-plan.interface.js';
import { BillingCountrySummary } from '../../interfaces/billing-country-summary.interface.js';
import { BillingPlanUpdateResult } from '../../interfaces/billing-plan-update-result.interface.js';
import { BillingPlanWithPrices } from '../../interfaces/billing-plan-with-prices.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';

/** Plans with their subscription counts and current prices (plan section 8.3). */
@Injectable()
export class AdminBillingPlansService {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly subscriptions: SubscriptionService,
    private readonly settings: BillingSettingsService,
    private readonly usage: BillingUsageService,
  ) {}

  async findAll(now = new Date()): Promise<AdminBillingPlan[]> {
    const [plans, counts] = await Promise.all([
      this.plans.findAll(),
      this.subscriptions.countByPlan(),
    ]);
    return plans.map((plan) =>
      this.adminPlan(plan, counts.get(plan.id) ?? 0, now),
    );
  }

  async create(
    dto: CreateBillingPlanDto,
    actorId: string,
  ): Promise<AdminBillingPlan> {
    return this.adminPlan(await this.plans.create(dto, actorId), 0, new Date());
  }

  /** The answer tells how many subscriptions the new limits put over the limit. */
  async update(
    id: string,
    dto: UpdateBillingPlanDto,
    actorId: string,
  ): Promise<BillingPlanUpdateResult> {
    const plan = await this.plans.update(id, dto, actorId);
    const subscriptions = await this.subscriptions.findManyByPlan(id);
    const usage = await this.usage.usageByBrands(
      subscriptions.map((s) => s.brandId),
    );
    const overLimitSubscriptions = subscriptions.filter((s) =>
      EffectiveLimitsCalculator.isOverLimit(
        EffectiveLimitsCalculator.compute({ ...s, plan }),
        usage.get(s.brandId)!,
      ),
    ).length;
    return {
      ...this.adminPlan(plan, subscriptions.length, new Date()),
      overLimitSubscriptions,
    };
  }

  async archive(id: string, actorId: string): Promise<AdminBillingPlan> {
    return this.withCount(await this.plans.archive(id, actorId));
  }

  async restore(id: string, actorId: string): Promise<AdminBillingPlan> {
    return this.withCount(await this.plans.restore(id, actorId));
  }

  /** Countries with prices or subscriptions, and the default country. */
  async countries(now = new Date()): Promise<BillingCountrySummary[]> {
    const [plans, subscriptions, settings] = await Promise.all([
      this.plans.findAll(),
      this.subscriptions.countByCountry(),
      this.settings.get(),
    ]);
    const codes = new Set([
      settings.defaultCountryCode,
      ...plans.flatMap((plan) => plan.prices.map((price) => price.countryCode)),
      ...subscriptions.keys(),
    ]);
    return [...codes].sort().map((countryCode) => ({
      countryCode,
      currency: PricingCountryResolver.currency(plans, countryCode),
      plansWithPrices: plans.filter(
        (plan) =>
          PricingCountryResolver.periodPrices(plan, countryCode, now) !== null,
      ).length,
      subscriptions: subscriptions.get(countryCode) ?? 0,
    }));
  }

  private adminPlan(
    plan: BillingPlanWithPrices,
    subscriptions: number,
    now: Date,
  ): AdminBillingPlan {
    const countries = [
      ...new Set(plan.prices.map((p) => p.countryCode)),
    ].sort();
    return {
      plan,
      subscriptions,
      currentPrices: countries.flatMap((countryCode) => {
        const prices = PricingCountryResolver.periodPrices(
          plan,
          countryCode,
          now,
        );
        return [prices?.MONTH, prices?.YEAR].filter(
          (p): p is BillingPlanPrice => !!p,
        );
      }),
      upcomingPrices: PricingCountryResolver.upcoming(plan.prices, now),
    };
  }

  private async withCount(
    plan: BillingPlanWithPrices,
  ): Promise<AdminBillingPlan> {
    const counts = await this.subscriptions.countByPlan();
    return this.adminPlan(plan, counts.get(plan.id) ?? 0, new Date());
  }
}
