import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { EffectiveLimitsCalculator } from './compute/effective-limits.calculator.js';
import { SubscriptionStateCalculator } from './compute/subscription-state.calculator.js';
import { UsageResource } from './enums/usage-resource.enum.js';
import { LimitReachedPayload } from './interfaces/limit-reached-payload.interface.js';
import { SubscriptionOrigin } from './interfaces/subscription-origin.interface.js';
import { BillingSettingsService } from './settings/services/billing-settings.service.js';
import { SubscriptionAccessService } from './subscriptions/services/subscription-access.service.js';
import { PaymentRequestService } from './payments/services/payment-request.service.js';
import { SubscriptionStartService } from './subscriptions/services/subscription-start.service.js';
import { SubscriptionService } from './subscriptions/services/subscription.service.js';

/**
 * What other domains need from billing (plan section 10.1). Brands, staff,
 * locations and bookings depend on this facade only.
 */
@Injectable()
export class BillingFacade {
  constructor(
    private readonly settings: BillingSettingsService,
    private readonly subscriptions: SubscriptionService,
    private readonly starts: SubscriptionStartService,
    private readonly requests: PaymentRequestService,
    private readonly access: SubscriptionAccessService,
  ) {}

  /** BrandService.create, inside its transaction. Nothing before launch. */
  startSubscription(
    brandId: string,
    ownerUserId: string,
    origin: SubscriptionOrigin,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.starts.start(brandId, ownerUserId, origin, tx);
  }

  /**
   * Staff activation and location creation. Locks the subscription row first and
   * counts after, so two parallel requests cannot both take the last seat.
   */
  async assertUsageIncreaseAllowed(
    brandId: string,
    resource: UsageResource,
    count: () => Promise<number>,
    tx: Prisma.TransactionClient,
    now = new Date(),
  ): Promise<void> {
    const settings = await this.settings.get();
    if (!settings.enforcementEnabled) return;
    const subscription = await this.subscriptions.lock(brandId, tx);
    if (!subscription) return;
    const limits = this.access.limits(
      { subscription, pendingPayment: null },
      settings,
      {
        state: SubscriptionStateCalculator.state(
          subscription,
          settings.graceDays,
          now,
        ),
      },
    );
    const limit =
      resource === UsageResource.STAFF ? limits.staff : limits.locations;
    if (limit === null) return;
    const used = await count();
    if (used + 1 <= limit) return;

    const suggested = (
      await this.access.selfServePlans(subscription.countryCode, now)
    ).find((plan) =>
      EffectiveLimitsCalculator.fitsLimit(
        resource === UsageResource.STAFF ? plan.staffLimit : plan.locationLimit,
        used + 1,
      ),
    );
    const payload: LimitReachedPayload = {
      resource,
      limit,
      used,
      planCode: subscription.plan?.code ?? null,
      suggestedPlanCode: suggested?.code ?? null,
    };
    throw new AppException(
      resource === UsageResource.STAFF
        ? ErrorCode.PLAN_STAFF_LIMIT_REACHED
        : ErrorCode.PLAN_LOCATION_LIMIT_REACHED,
      HttpStatus.CONFLICT,
      payload,
    );
  }

  /** Booking setup and public booking creation (plan section 6.2). */
  isOnlineBookingOpen(brandId: string): Promise<boolean> {
    return this.access.isOnlineBookingOpen(brandId);
  }

  /** Brand deletion, inside its transaction (plan section 4.7). */
  cancelOpenPayments(
    brandId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.requests.cancelOpenPayments(brandId, tx);
  }
}
