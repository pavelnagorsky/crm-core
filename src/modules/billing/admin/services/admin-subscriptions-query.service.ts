import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { SubscriptionStateCalculator } from '../../compute/subscription-state.calculator.js';
import { AdminSubscriptionsRequestDto } from '../../dto/admin-subscriptions-request.dto.js';
import { AdminSubscriptionOrderBy } from '../../enums/admin-subscription-order-by.enum.js';
import { AdminSubscriptionDetails } from '../../interfaces/admin-subscription-details.interface.js';
import { AdminSubscriptionItem } from '../../interfaces/admin-subscription-item.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionEventService } from '../../subscriptions/services/subscription-event.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { AdminSubscriptionAssessor } from './admin-subscription-assessor.service.js';
import { AdminSubscriptionFilter } from './admin-subscription-filter.service.js';

const RECENT_PAYMENTS = 20;
const RECENT_EVENTS = 50;

/** The admin subscription list and card (plan section 8.3). */
@Injectable()
export class AdminSubscriptionsQueryService {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly payments: SubscriptionPaymentService,
    private readonly events: SubscriptionEventService,
    private readonly plans: BillingPlanService,
    private readonly settings: BillingSettingsService,
    private readonly filter: AdminSubscriptionFilter,
    private readonly assessor: AdminSubscriptionAssessor,
  ) {}

  async search(
    dto: AdminSubscriptionsRequestDto,
    now = new Date(),
  ): Promise<PaginatedResult<AdminSubscriptionItem>> {
    const where = await this.filter.where(dto);
    if (!where) return { items: [], totalItems: 0 };
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy: Prisma.SubscriptionOrderByWithRelationInput = {
      [dto.orderBy ?? AdminSubscriptionOrderBy.ACCESS_ENDS_AT]: direction,
    };
    const paging = { skip: (dto.page - 1) * dto.pageSize, take: dto.pageSize };

    if (!this.hasComputedFilters(dto)) {
      const { items, totalItems } = await this.subscriptions.search(
        where,
        orderBy,
        direction,
        dto.isExport ? {} : paging,
      );
      return { items: await this.assessor.items(items, now), totalItems };
    }
    // State and limits are computed from dates and usage, so they are filtered in memory.
    const { items } = await this.subscriptions.search(
      where,
      orderBy,
      direction,
      {},
    );
    const matched = await this.applyComputedFilters(items, dto, now);
    const page = dto.isExport
      ? matched
      : matched.slice(paging.skip, paging.skip + paging.take);
    return {
      items: await this.assessor.items(page, now),
      totalItems: matched.length,
    };
  }

  async findSubscription(
    brandId: string,
    now = new Date(),
  ): Promise<AdminSubscriptionDetails> {
    const subscription = await this.subscriptions.findByBrandOrThrow(brandId);
    const [[item], plans, settings, payments, events] = await Promise.all([
      this.assessor.items([subscription], now),
      this.plans.findAllCached(),
      this.settings.get(),
      this.payments.findRecentForBrand(brandId, RECENT_PAYMENTS),
      this.events.findRecent(subscription.id, RECENT_EVENTS),
    ]);
    const pricingCountry = PricingCountryResolver.pricingCountry(
      plans,
      subscription.countryCode,
      settings.defaultCountryCode,
      now,
    );
    return {
      ...item,
      pricingCountry,
      currency: PricingCountryResolver.currency(plans, pricingCountry),
      payments,
      events,
    };
  }

  private hasComputedFilters(dto: AdminSubscriptionsRequestDto): boolean {
    return (
      !!dto.state?.length ||
      dto.overLimit !== undefined ||
      dto.needsCustomPlan !== undefined
    );
  }

  /** The state first (dates only), usage only when a limit filter is set. */
  private async applyComputedFilters(
    items: SubscriptionWithPlan[],
    dto: AdminSubscriptionsRequestDto,
    now: Date,
  ): Promise<SubscriptionWithPlan[]> {
    const settings = await this.settings.get();
    const matched = dto.state?.length
      ? items.filter((s) =>
          dto.state!.includes(
            SubscriptionStateCalculator.state(s, settings.graceDays, now),
          ),
        )
      : items;
    if (dto.overLimit === undefined && dto.needsCustomPlan === undefined)
      return matched;
    const assessed = await this.assessor.assess(matched, settings, now);
    return matched.filter((s) => {
      const a = assessed.get(s.brandId)!;
      return (
        (dto.overLimit === undefined || a.overLimit === dto.overLimit) &&
        (dto.needsCustomPlan === undefined ||
          a.needsCustomPlan === dto.needsCustomPlan)
      );
    });
  }
}
