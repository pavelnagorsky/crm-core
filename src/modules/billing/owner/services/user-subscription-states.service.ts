import { Injectable } from '@nestjs/common';
import { BusinessRole } from '@prisma/client';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { BrandService } from '../../../brand/services/brand.service.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { SubscriptionState } from '../../enums/subscription-state.enum.js';
import { SubscriptionStateItem } from '../../interfaces/subscription-state-item.interface.js';
import { TrialEligibility } from '../../interfaces/trial-eligibility.interface.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';

/** Billing as the signed-in user sees it across all their brands. */
@Injectable()
export class UserSubscriptionStatesService {
  constructor(
    private readonly access: SubscriptionAccessService,
    private readonly subscriptions: SubscriptionService,
    private readonly usage: BillingUsageService,
    private readonly brands: BrandService,
  ) {}

  /** A user gets one trial in their life (plan section 4.1). */
  async trialEligibility(userId: string): Promise<TrialEligibility> {
    const brandId = await this.subscriptions.findTrialBrandId(userId);
    if (!brandId) return { eligible: true, usedInBrandName: null };
    return {
      eligible: false,
      usedInBrandName: await this.brands.findName(brandId),
    };
  }

  /** Banner and blocking for every brand of the token; FREE brands are omitted. */
  async states(
    token: TokenPayloadDto,
    now = new Date(),
  ): Promise<SubscriptionStateItem[]> {
    const brandIds = [
      ...new Set([
        ...token.brandMemberships.map((m) => m.brandId),
        ...token.locationMemberships.map((m) => m.brandId),
      ]),
    ];
    const owned = new Set(
      token.brandMemberships
        .filter((m) => m.role === BusinessRole.OWNER)
        .map((m) => m.brandId),
    );
    const states = await Promise.all(
      brandIds.map(async (brandId) => ({
        brandId,
        state: await this.access.state(brandId, now),
      })),
    );
    const paid = states.filter(
      (s) => s.state.view.state !== SubscriptionState.FREE,
    );
    const limited = paid.filter(
      ({ state }) =>
        state.limits.staff !== null || state.limits.locations !== null,
    );
    const usage = await this.usage.usageByBrands(limited.map((s) => s.brandId));
    return paid.map(({ brandId, state }) => ({
      brandId,
      view: state.view,
      overLimit:
        usage.has(brandId) &&
        EffectiveLimitsCalculator.isOverLimit(
          state.limits,
          usage.get(brandId)!,
        ),
      hasPendingPayment: !!state.snapshot.pendingPayment,
      isOwner: owned.has(brandId),
    }));
  }
}
