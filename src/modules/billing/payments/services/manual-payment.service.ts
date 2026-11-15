import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BillingPeriod,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { PricingCountryResolver } from '../../compute/pricing-country.resolver.js';
import { PAYMENT_DATE_FUTURE_TOLERANCE_MS } from '../../constants/payment-date-tolerance.js';
import { AdminPaymentInput } from '../../interfaces/admin-payment-input.interface.js';
import { ComplimentaryExtensionInput } from '../../interfaces/complimentary-extension-input.interface.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { PaymentApplicationService } from './payment-application.service.js';
import { PaymentRequestService } from './payment-request.service.js';

/** Payments an admin creates already PAID: an offline payment or a free extension. */
@Injectable()
export class ManualPaymentService {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly requests: PaymentRequestService,
    private readonly application: PaymentApplicationService,
    private readonly settings: BillingSettingsService,
    private readonly plans: BillingPlanService,
  ) {}

  /** «Зачесть оплату»: an OFFLINE payment created PAID and applied at once. */
  async recordPayment(
    brandId: string,
    input: AdminPaymentInput,
    now = new Date(),
  ): Promise<SubscriptionPayment> {
    const amount = MoneyUtils.quantize(input.amount);
    if (amount.lte(0))
      throw new BadRequestException('amount must be greater than 0');
    if (
      input.paidAt.getTime() >
      now.getTime() + PAYMENT_DATE_FUTURE_TOLERANCE_MS
    )
      throw new AppException(
        ErrorCode.SUBSCRIPTION_PAYMENT_DATE_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    return this.subscriptions.withLock(brandId, async (subscription, tx) => {
      if (input.plan.id !== subscription.planId)
        await this.requests.cancelPending(
          subscription,
          input.actor,
          'plan_changed',
          tx,
        );
      const created = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          brandId,
          planId: input.plan.id,
          planName: input.plan.name,
          billingPeriod: input.billingPeriod,
          countryCode: subscription.countryCode,
          currency: input.currency.toUpperCase(),
          amount,
          provider: SubscriptionPaymentProvider.OFFLINE,
          status: SubscriptionPaymentStatus.PAID,
          method: input.method,
          reference: input.reference,
          adminNote: input.adminNote,
          paidAt: input.paidAt,
          confirmedAt: now,
          confirmedById: input.actor.id,
          createdById: input.actor.id,
          createdByRole: input.actor.role,
        },
      });
      return this.application.apply(
        subscription,
        created,
        input.actor,
        tx,
        now,
      );
    });
  }

  /** «Продлить без оплаты»: COMPLIMENTARY, amount 0, event PERIOD_EXTENDED. */
  async extendComplimentary(
    brandId: string,
    input: ComplimentaryExtensionInput,
    now = new Date(),
  ): Promise<SubscriptionPayment> {
    if ((input.days === undefined) === (input.until === undefined))
      throw new BadRequestException('Pass exactly one of days and until');
    const [settings, plans] = await Promise.all([
      this.settings.get(),
      this.plans.findAllCached(),
    ]);
    return this.subscriptions.withLock(brandId, async (subscription, tx) => {
      if (!subscription.plan)
        throw new AppException(
          ErrorCode.SUBSCRIPTION_PLAN_REQUIRED,
          HttpStatus.CONFLICT,
        );
      const pricingCountry = PricingCountryResolver.pricingCountry(
        plans,
        subscription.countryCode,
        settings.defaultCountryCode,
        now,
      );
      const created = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          brandId,
          planId: subscription.plan.id,
          planName: subscription.plan.name,
          billingPeriod: subscription.billingPeriod ?? BillingPeriod.MONTH,
          countryCode: subscription.countryCode,
          currency:
            subscription.customCurrency ??
            PricingCountryResolver.currency(plans, pricingCountry),
          amount: MoneyUtils.decimal(0),
          provider: SubscriptionPaymentProvider.COMPLIMENTARY,
          status: SubscriptionPaymentStatus.PAID,
          method: SubscriptionPaymentMethod.NONE,
          adminNote: input.reason,
          paidAt: now,
          confirmedAt: now,
          confirmedById: input.actor.id,
          createdById: input.actor.id,
          createdByRole: input.actor.role,
        },
      });
      const length =
        input.days !== undefined
          ? { days: input.days }
          : {
              until: TimeUtils.zonedDateStart(
                input.until!,
                subscription.timezone,
              ),
            };
      return this.application.apply(
        subscription,
        created,
        input.actor,
        tx,
        now,
        length,
      );
    });
  }
}
