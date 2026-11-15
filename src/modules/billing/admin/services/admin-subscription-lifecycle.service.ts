import { Injectable, NotFoundException } from '@nestjs/common';
import { BrandService } from '../../../brand/services/brand.service.js';
import { LocationService } from '../../../location/services/location.service.js';
import { BillingOrigin } from '../../compute/billing-origin.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { ChangeSubscriptionCountryDto } from '../../dto/change-subscription-country.dto.js';
import { ExtendTrialDto } from '../../dto/extend-trial.dto.js';
import { ExtendTrialsDto } from '../../dto/extend-trials.dto.js';
import { StartSubscriptionDto } from '../../dto/start-subscription.dto.js';
import { AdminSubscriptionDetails } from '../../interfaces/admin-subscription-details.interface.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionStartService } from '../../subscriptions/services/subscription-start.service.js';
import { SubscriptionTermsService } from '../../subscriptions/services/subscription-terms.service.js';
import { AdminSubscriptionsQueryService } from './admin-subscriptions-query.service.js';

/** Admin actions on the subscription itself: pilot start, trial, country, suspension. */
@Injectable()
export class AdminSubscriptionLifecycleService {
  constructor(
    private readonly starts: SubscriptionStartService,
    private readonly terms: SubscriptionTermsService,
    private readonly settings: BillingSettingsService,
    private readonly brands: BrandService,
    private readonly locations: LocationService,
    private readonly query: AdminSubscriptionsQueryService,
  ) {}

  /** A subscription for a brand that has none, e.g. one created by a seed (plan section 4.1). */
  async start(
    brandId: string,
    dto: StartSubscriptionDto,
    actorId: string,
    now = new Date(),
  ): Promise<AdminSubscriptionDetails> {
    if (!(await this.brands.findActiveIds([brandId])).has(brandId))
      throw new NotFoundException('Brand not found');
    const [origins, settings] = await Promise.all([
      this.locations.findBillingOrigins([brandId]),
      this.settings.get(),
    ]);
    await this.starts.startPilot(
      brandId,
      origins.get(brandId) ??
        BillingOrigin.fallback(settings.defaultCountryCode),
      dto.trialEndsOn,
      BillingActors.admin(actorId),
      now,
    );
    return this.query.findSubscription(brandId, now);
  }

  extendTrials(dto: ExtendTrialsDto, actorId: string): Promise<number> {
    return this.terms.extendTrials(
      dto.until,
      dto.reason,
      dto.dryRun ?? false,
      BillingActors.admin(actorId),
    );
  }

  async extendTrial(
    brandId: string,
    dto: ExtendTrialDto,
    actorId: string,
  ): Promise<AdminSubscriptionDetails> {
    await this.terms.extendTrial(
      brandId,
      dto.days,
      dto.reason,
      BillingActors.admin(actorId),
    );
    return this.query.findSubscription(brandId);
  }

  async changeCountry(
    brandId: string,
    dto: ChangeSubscriptionCountryDto,
    actorId: string,
  ): Promise<AdminSubscriptionDetails> {
    await this.terms.changeCountry(
      brandId,
      dto.countryCode,
      dto.reason,
      BillingActors.admin(actorId),
    );
    return this.query.findSubscription(brandId);
  }

  async suspend(
    brandId: string,
    reason: string,
    actorId: string,
  ): Promise<AdminSubscriptionDetails> {
    await this.terms.suspend(brandId, reason, BillingActors.admin(actorId));
    return this.query.findSubscription(brandId);
  }

  async resume(
    brandId: string,
    actorId: string,
  ): Promise<AdminSubscriptionDetails> {
    await this.terms.resume(brandId, BillingActors.admin(actorId));
    return this.query.findSubscription(brandId);
  }
}
