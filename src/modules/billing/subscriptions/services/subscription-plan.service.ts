import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BillingPlan,
  Prisma,
  Subscription,
  SubscriptionEventType,
} from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AccessDatesCalculator } from '../../compute/access-dates.calculator.js';
import { PlanConversionCalculator } from '../../compute/plan-conversion.calculator.js';
import { GRACE_EXTENSION_RESET } from '../../constants/grace-extension-reset.js';
import { AssignPlanInput } from '../../interfaces/assign-plan-input.interface.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { PlanChangeData } from '../../interfaces/plan-change-data.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionEventService } from './subscription-event.service.js';

type Tx = Prisma.TransactionClient;

/**
 * Plan and custom terms of a subscription (plan section 4.4). The caller has locked
 * the row and canceled the open request when the plan changes.
 */
@Injectable()
export class SubscriptionPlanService {
  constructor(
    private readonly events: SubscriptionEventService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
  ) {}

  /** Owner plan change: the paid remainder becomes days of the new plan. */
  async changePlan(
    subscription: SubscriptionWithPlan,
    newPlan: BillingPlan,
    actor: BillingActor,
    tx: Tx,
    now = new Date(),
  ): Promise<Subscription> {
    if (
      !subscription.plan ||
      !PlanConversionCalculator.hasPaidRemainder(subscription, now)
    )
      throw new AppException(
        ErrorCode.SUBSCRIPTION_NO_PAID_PERIOD,
        HttpStatus.CONFLICT,
      );
    const paidUntil = await this.convertedPaidUntil(
      subscription,
      newPlan,
      { ...subscription, planId: newPlan.id },
      tx,
      now,
    );
    return this.write(
      subscription,
      { planId: newPlan.id, paidUntil },
      actor,
      tx,
      {
        planIdBefore: subscription.planId,
        planId: newPlan.id,
        planCode: newPlan.code,
      },
    );
  }

  /** Admin assignment of a plan and custom terms (PUT .../plan). */
  async assignPlan(
    subscription: SubscriptionWithPlan,
    input: AssignPlanInput,
    actor: BillingActor,
    tx: Tx,
    now = new Date(),
  ): Promise<Subscription> {
    const terms = {
      planId: input.plan.id,
      billingPeriod: input.billingPeriod ?? subscription.billingPeriod,
      customStaffLimit: keep(
        input.customStaffLimit,
        subscription.customStaffLimit,
      ),
      customLocationLimit: keep(
        input.customLocationLimit,
        subscription.customLocationLimit,
      ),
      customCurrency: keep(
        input.customCurrency?.toUpperCase(),
        subscription.customCurrency,
      ),
      customMonthlyPrice: keep(
        input.customMonthlyPrice,
        subscription.customMonthlyPrice,
      ),
      customYearlyPrice: keep(
        input.customYearlyPrice,
        subscription.customYearlyPrice,
      ),
    };
    const planChanges = subscription.planId !== input.plan.id;
    const paidUntil =
      input.convertRemaining &&
      planChanges &&
      subscription.plan &&
      PlanConversionCalculator.hasPaidRemainder(subscription, now)
        ? await this.convertedPaidUntil(
            subscription,
            input.plan,
            { ...subscription, ...terms },
            tx,
            now,
          )
        : null;
    return this.write(
      subscription,
      { ...terms, paidUntil },
      actor,
      tx,
      {
        planIdBefore: subscription.planId,
        planCode: input.plan.code,
        ...terms,
        reason: input.reason,
      },
      planChanges
        ? SubscriptionEventType.PLAN_CHANGED
        : SubscriptionEventType.CUSTOM_TERMS_CHANGED,
    );
  }

  /** paidUntil of the remainder in days of the new plan; both prices must exist. */
  private async convertedPaidUntil(
    subscription: SubscriptionWithPlan,
    newPlan: BillingPlan,
    newTerms: Subscription,
    tx: Tx,
    now: Date,
  ): Promise<Date> {
    const settings = await this.settings.read(tx);
    const paidUntil = PlanConversionCalculator.convertedPaidUntil(
      subscription,
      newPlan,
      newTerms,
      await this.plans.findAllCached(),
      settings.defaultCountryCode,
      now,
    );
    if (!paidUntil)
      throw new AppException(
        ErrorCode.BILLING_PLAN_PRICE_MISSING,
        HttpStatus.CONFLICT,
      );
    return paidUntil;
  }

  private async write(
    subscription: Subscription,
    data: PlanChangeData,
    actor: BillingActor,
    tx: Tx,
    payload: Record<string, unknown>,
    type: SubscriptionEventType = SubscriptionEventType.PLAN_CHANGED,
  ): Promise<Subscription> {
    const { paidUntil, ...terms } = data;
    const dates = paidUntil
      ? {
          ...AccessDatesCalculator.paidThrough(subscription, paidUntil),
          ...GRACE_EXTENSION_RESET,
        }
      : {};
    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: { ...terms, ...dates },
    });
    await this.events.record(
      subscription,
      type,
      actor,
      {
        ...payload,
        paidUntilBefore: subscription.paidUntil,
        paidUntilAfter: updated.paidUntil,
      },
      tx,
    );
    return updated;
  }
}

/** An omitted field keeps its value; null clears it. */
function keep<T>(value: T | undefined, current: T): T {
  return value === undefined ? current : value;
}
