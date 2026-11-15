import { Injectable } from '@nestjs/common';
import { BillingPlan, BillingSettings } from '@prisma/client';
import { AccessService } from '../../../access/services/access.service.js';
import { BrandService } from '../../../brand/services/brand.service.js';
import { UserService } from '../../../user/services/user.service.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { SubscriptionStateCalculator } from '../../compute/subscription-state.calculator.js';
import { AdminSubscriptionItem } from '../../interfaces/admin-subscription-item.interface.js';
import { SubscriptionAssessment } from '../../interfaces/subscription-assessment.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';

/** What the admin sees about a subscription: brand, owners, state, limits and usage. */
@Injectable()
export class AdminSubscriptionAssessor {
  constructor(
    private readonly access: SubscriptionAccessService,
    private readonly payments: SubscriptionPaymentService,
    private readonly settings: BillingSettingsService,
    private readonly usage: BillingUsageService,
    private readonly brands: BrandService,
    private readonly accessService: AccessService,
    private readonly users: UserService,
  ) {}

  async items(
    subscriptions: SubscriptionWithPlan[],
    now: Date,
  ): Promise<AdminSubscriptionItem[]> {
    if (!subscriptions.length) return [];
    const brandIds = subscriptions.map((s) => s.brandId);
    const [names, active, owners, pending, settings] = await Promise.all([
      this.brands.findNames(brandIds),
      this.brands.findActiveIds(brandIds),
      this.accessService.findOwnerIdsByBrands(brandIds),
      this.payments.findBrandIdsWithPending(brandIds),
      this.settings.get(),
    ]);
    const [people, assessed] = await Promise.all([
      this.users.findAccessParticipants([...owners.values()].flat()),
      this.assess(subscriptions, settings, now),
    ]);
    const emails = new Map(people.map((u) => [u.id, u.email]));

    return subscriptions.map((subscription) => ({
      subscription,
      brandName: names.get(subscription.brandId) ?? null,
      brandDeleted: !active.has(subscription.brandId),
      ownerEmails: (owners.get(subscription.brandId) ?? [])
        .map((id) => emails.get(id))
        .filter((email): email is string => !!email),
      ...assessed.get(subscription.brandId)!,
      hasPendingPayment: pending.has(subscription.brandId),
    }));
  }

  /** State, limits, usage and the two limit flags of each subscription, by brand id. */
  async assess(
    subscriptions: SubscriptionWithPlan[],
    settings: BillingSettings,
    now: Date,
  ): Promise<Map<string, SubscriptionAssessment>> {
    const countries = [...new Set(subscriptions.map((s) => s.countryCode))];
    const [usage, plansByCountry] = await Promise.all([
      this.usage.usageByBrands(subscriptions.map((s) => s.brandId)),
      Promise.all(
        countries.map((code) => this.access.selfServePlans(code, now)),
      ),
    ]);
    const selfServe = new Map<string, BillingPlan[]>(
      countries.map((code, i) => [code, plansByCountry[i]]),
    );
    return new Map(
      subscriptions.map((subscription) => {
        const view = SubscriptionStateCalculator.view(
          subscription,
          settings,
          now,
        );
        const limits = this.access.limits(
          { subscription, pendingPayment: null },
          settings,
          view,
        );
        const brandUsage = usage.get(subscription.brandId)!;
        return [
          subscription.brandId,
          {
            view,
            limits,
            usage: brandUsage,
            overLimit: EffectiveLimitsCalculator.isOverLimit(
              limits,
              brandUsage,
            ),
            needsCustomPlan: EffectiveLimitsCalculator.needsCustomPlan(
              subscription.plan,
              selfServe.get(subscription.countryCode)!,
              brandUsage,
            ),
          },
        ];
      }),
    );
  }
}
