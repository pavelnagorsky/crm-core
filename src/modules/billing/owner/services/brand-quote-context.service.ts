import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BrandQuoteContext } from '../../interfaces/brand-quote-context.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import { BillingUsageService } from '../../usage/services/billing-usage.service.js';

/** Loads what the owner quotes need; a brand without a subscription gets a 409. */
@Injectable()
export class BrandQuoteContextService {
  constructor(
    private readonly access: SubscriptionAccessService,
    private readonly usage: BillingUsageService,
    private readonly plans: BillingPlanService,
  ) {}

  async load(brandId: string, now: Date): Promise<BrandQuoteContext> {
    const [state, usage, plans] = await Promise.all([
      this.access.state(brandId, now),
      this.usage.usage(brandId),
      this.plans.findAllCached(),
    ]);
    const subscription = state.snapshot.subscription;
    if (!subscription)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_NOT_STARTED,
        HttpStatus.CONFLICT,
      );
    return { state, subscription, usage, plans };
  }
}
