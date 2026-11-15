import { HttpStatus, Injectable } from '@nestjs/common';
import { BillingPlanStatus, Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { AssignSubscriptionPlanDto } from '../../dto/assign-subscription-plan.dto.js';
import { ExtendSubscriptionDto } from '../../dto/extend-subscription.dto.js';
import { RecordSubscriptionPaymentDto } from '../../dto/record-subscription-payment.dto.js';
import { AdminSubscriptionDetails } from '../../interfaces/admin-subscription-details.interface.js';
import { PaymentMailService } from '../../mail/services/payment-mail.service.js';
import { ManualPaymentService } from '../../payments/services/manual-payment.service.js';
import { PaymentRequestService } from '../../payments/services/payment-request.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { SubscriptionPlanService } from '../../subscriptions/services/subscription-plan.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { AdminSubscriptionsQueryService } from './admin-subscriptions-query.service.js';

/** Admin actions on what the brand pays for: plan and terms, offline payments, free days. */
@Injectable()
export class AdminSubscriptionBillingService {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly subscriptionPlans: SubscriptionPlanService,
    private readonly requests: PaymentRequestService,
    private readonly manual: ManualPaymentService,
    private readonly plans: BillingPlanService,
    private readonly paymentMail: PaymentMailService,
    private readonly query: AdminSubscriptionsQueryService,
  ) {}

  /** Plan and custom terms (PUT .../plan). A plan change cancels the open request. */
  async assignPlan(
    brandId: string,
    dto: AssignSubscriptionPlanDto,
    actorId: string,
    now = new Date(),
  ): Promise<AdminSubscriptionDetails> {
    const actor = BillingActors.admin(actorId);
    const plan = await this.plans.findByCode(dto.planCode);
    await this.subscriptions.withLock(brandId, async (subscription, tx) => {
      const planChanged = plan.id !== subscription.planId;
      if (planChanged && plan.status === BillingPlanStatus.ARCHIVED)
        throw new AppException(
          ErrorCode.BILLING_PLAN_NOT_AVAILABLE,
          HttpStatus.CONFLICT,
        );
      if (planChanged)
        await this.requests.cancelPending(
          subscription,
          actor,
          'plan_changed',
          tx,
        );
      return this.subscriptionPlans.assignPlan(
        subscription,
        {
          plan,
          billingPeriod: dto.billingPeriod,
          customStaffLimit: dto.customStaffLimit,
          customLocationLimit: dto.customLocationLimit,
          customCurrency: dto.customCurrency,
          customMonthlyPrice: decimal(dto.customMonthlyPrice),
          customYearlyPrice: decimal(dto.customYearlyPrice),
          convertRemaining: dto.convertRemaining,
          reason: dto.reason,
        },
        actor,
        tx,
        now,
      );
    });
    return this.query.findSubscription(brandId, now);
  }

  /** «Зачесть оплату»: created PAID and applied at once. */
  async recordPayment(
    brandId: string,
    dto: RecordSubscriptionPaymentDto,
    actorId: string,
    now = new Date(),
  ): Promise<AdminSubscriptionDetails> {
    const plan = await this.plans.findByCode(dto.planCode);
    const payment = await this.manual.recordPayment(
      brandId,
      {
        plan,
        billingPeriod: dto.billingPeriod,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        paidAt: new Date(dto.paidAt),
        method: dto.method,
        reference: dto.reference ?? null,
        adminNote: dto.adminNote ?? null,
        actor: BillingActors.admin(actorId),
      },
      now,
    );
    await this.paymentMail.received(payment);
    return this.query.findSubscription(brandId, now);
  }

  /** «Продлить без оплаты». */
  async extend(
    brandId: string,
    dto: ExtendSubscriptionDto,
    actorId: string,
  ): Promise<AdminSubscriptionDetails> {
    await this.manual.extendComplimentary(brandId, {
      days: dto.days,
      until: dto.until,
      reason: dto.reason,
      actor: BillingActors.admin(actorId),
    });
    return this.query.findSubscription(brandId);
  }
}

/** undefined keeps the field, null clears it. */
function decimal(
  value: string | null | undefined,
): Prisma.Decimal | null | undefined {
  return value === undefined || value === null
    ? value
    : new Prisma.Decimal(value);
}
