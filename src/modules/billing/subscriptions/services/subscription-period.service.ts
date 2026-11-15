import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Subscription,
  SubscriptionEventType,
  SubscriptionPayment,
} from '@prisma/client';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { AccessDatesCalculator } from '../../compute/access-dates.calculator.js';
import { EventPayload } from '../../compute/event-payload.js';
import { PaymentProjectionCalculator } from '../../compute/payment-projection.calculator.js';
import { SubscriptionStateCalculator } from '../../compute/subscription-state.calculator.js';
import { GRACE_EXTENSION_RESET } from '../../constants/grace-extension-reset.js';
import { SubscriptionState } from '../../enums/subscription-state.enum.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { BillingPeriodResult } from '../../interfaces/billing-period-result.interface.js';
import { ComplimentaryLength } from '../../interfaces/complimentary-length.type.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionEventService } from './subscription-event.service.js';

type Tx = Prisma.TransactionClient;

/** Moves the paid end of a subscription: applied payments and grace for an open request. */
@Injectable()
export class SubscriptionPeriodService {
  private readonly logger = new Logger(SubscriptionPeriodService.name);

  constructor(
    private readonly events: SubscriptionEventService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
  ) {}

  /**
   * Applies a PAID payment (plan section 4.2). Knows nothing about the provider.
   * A different plan with a paid remainder converts the remainder first (4.4).
   */
  async applyPayment(
    subscription: SubscriptionWithPlan,
    payment: SubscriptionPayment,
    actor: BillingActor,
    tx: Tx,
    now = new Date(),
    complimentary?: ComplimentaryLength,
  ): Promise<BillingPeriodResult> {
    const settings = await this.settings.read(tx);
    const plans = await this.plans.findAllCached();
    const { period, convertedPaidUntil, conversionFailed } =
      PaymentProjectionCalculator.project(
        subscription,
        {
          plan: plans.find((p) => p.id === payment.planId) ?? null,
          billingPeriod: payment.billingPeriod,
          paidAt: payment.paidAt ?? now,
          complimentary,
        },
        plans,
        settings,
        now,
      );
    if (conversionFailed)
      this.logger.warn(
        `Payment ${payment.id}: no price to convert the remainder of ${subscription.brandId}, applied without conversion`,
      );
    if (period.periodEnd <= period.periodStart)
      throw new BadRequestException('The period must end after it starts');

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: payment.planId,
        billingPeriod: payment.billingPeriod,
        billingAnchorDay: period.anchorDay,
        paidUntil: period.periodEnd,
        accessEndsAt: AccessDatesCalculator.accessEndsAt(
          subscription.trialEndsAt,
          period.periodEnd,
        ),
        ...GRACE_EXTENSION_RESET,
      },
    });
    await this.events.record(
      subscription,
      complimentary
        ? SubscriptionEventType.PERIOD_EXTENDED
        : SubscriptionEventType.PAYMENT_APPLIED,
      actor,
      {
        ...EventPayload.payment(payment),
        paidAt: payment.paidAt,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        paidUntilBefore: subscription.paidUntil,
        convertedPaidUntil,
        adminNote: complimentary ? payment.adminNote : undefined,
      },
      tx,
    );
    return period;
  }

  /**
   * Once per access cycle, an open request in PAST_DUE grants extra grace days
   * (plan section 4.2). A request in EXPIRED never unblocks.
   */
  async extendGraceForRequest(
    subscription: Subscription,
    actor: BillingActor,
    tx: Tx,
    now = new Date(),
  ): Promise<boolean> {
    const settings = await this.settings.read(tx);
    const state = SubscriptionStateCalculator.state(
      subscription,
      settings.graceDays,
      now,
    );
    if (
      state !== SubscriptionState.PAST_DUE ||
      settings.pendingRequestGraceDays <= 0 ||
      subscription.graceExtendedFor?.getTime() ===
        subscription.accessEndsAt.getTime()
    )
      return false;
    const regular = SubscriptionStateCalculator.regularGraceEndsAt(
      subscription,
      settings.graceDays,
    );
    const graceExtendedUntil = TimeUtils.addDaysInTz(
      regular,
      settings.pendingRequestGraceDays,
      subscription.timezone,
    );
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { graceExtendedUntil, graceExtendedFor: subscription.accessEndsAt },
    });
    await this.events.record(
      subscription,
      SubscriptionEventType.GRACE_EXTENDED,
      actor,
      { graceExtendedUntil, accessEndsAt: subscription.accessEndsAt },
      tx,
    );
    return true;
  }
}
