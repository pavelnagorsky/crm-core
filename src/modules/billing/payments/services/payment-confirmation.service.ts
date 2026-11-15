import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  BillingActorRole,
  SubscriptionEventType,
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingPeriodCalculator } from '../../compute/billing-period.calculator.js';
import { EventPayload } from '../../compute/event-payload.js';
import { PaymentReference } from '../../compute/payment-reference.js';
import { PAYMENT_DATE_FUTURE_TOLERANCE_MS } from '../../constants/payment-date-tolerance.js';
import { ConfirmPaymentInput } from '../../interfaces/confirm-payment-input.interface.js';
import { ConfirmPaymentResult } from '../../interfaces/confirm-payment-result.interface.js';
import { SubscriptionEventService } from '../../subscriptions/services/subscription-event.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { PaymentProviderRegistry } from '../payment-provider.registry.js';
import { PaymentApplicationService } from './payment-application.service.js';
import { SubscriptionPaymentService } from './subscription-payment.service.js';

/** A payment in one of these may still become PAID (plan section 4.2). */
const CONFIRMABLE_STATUSES = [
  SubscriptionPaymentStatus.PENDING,
  SubscriptionPaymentStatus.CANCELED,
  SubscriptionPaymentStatus.EXPIRED,
  SubscriptionPaymentStatus.FAILED,
];

/**
 * The single entry point that turns a payment into PAID and applies it: the admin
 * button now, a webhook later (plan section 10.2). Repeating it is safe.
 */
@Injectable()
export class PaymentConfirmationService {
  private readonly logger = new Logger(PaymentConfirmationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly payments: SubscriptionPaymentService,
    private readonly subscriptions: SubscriptionService,
    private readonly events: SubscriptionEventService,
    private readonly application: PaymentApplicationService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  async confirm(
    id: string,
    input: ConfirmPaymentInput,
    now = new Date(),
  ): Promise<ConfirmPaymentResult> {
    const payment = await this.payments.findById(id);
    const byAdmin = input.actor.role === BillingActorRole.ADMIN;
    if (payment.status === SubscriptionPaymentStatus.PAID) {
      if (byAdmin) throw this.notConfirmable(payment);
      return { payment, applied: false };
    }
    if (
      byAdmin &&
      !this.providers.find(payment.provider)?.capabilities.adminConfirmable
    )
      throw this.notConfirmable(payment);

    const subscription = await this.subscriptions.findByBrandOrThrow(
      payment.brandId,
    );
    this.assertPaidAt(
      input.paidAt,
      payment.createdAt,
      subscription.timezone,
      now,
    );
    const amount = MoneyUtils.quantize(input.amount);
    if (
      !amount.eq(payment.amount) ||
      input.currency.toUpperCase() !== payment.currency
    ) {
      await this.recordMismatch(payment, input, amount);
      return { payment, applied: false };
    }

    return this.subscriptions.withLock(payment.brandId, async (locked, tx) => {
      const { count } = await tx.subscriptionPayment.updateMany({
        where: { id, status: { in: CONFIRMABLE_STATUSES } },
        data: {
          status: SubscriptionPaymentStatus.PAID,
          paidAt: input.paidAt,
          confirmedAt: now,
          method: input.method,
          externalId: input.externalId ?? undefined,
          reference: input.reference ?? undefined,
          adminNote: input.adminNote ?? undefined,
          providerData: input.providerData,
          confirmedById: input.actor.id,
          failureReason: null,
        },
      });
      const paid = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id },
      });
      if (!count) return { payment: paid, applied: false };
      const applied = await this.application.apply(
        locked,
        paid,
        input.actor,
        tx,
        now,
      );
      return { payment: applied, applied: true };
    });
  }

  /** The provider reported another amount: nothing is applied, support sorts it out. */
  private async recordMismatch(
    payment: SubscriptionPayment,
    input: ConfirmPaymentInput,
    amount: SubscriptionPayment['amount'],
  ): Promise<void> {
    this.logger.error(
      `Payment ${PaymentReference.format(payment.number)} (${payment.id}) mismatch: expected ${MoneyUtils.format(payment.amount)} ${payment.currency}, got ${MoneyUtils.format(amount)} ${input.currency}`,
    );
    await this.events.record(
      { id: payment.subscriptionId, brandId: payment.brandId },
      SubscriptionEventType.PAYMENT_MISMATCH,
      input.actor,
      {
        ...EventPayload.payment(payment),
        receivedAmount: amount,
        receivedCurrency: input.currency.toUpperCase(),
        externalId: input.externalId,
      },
      this.db,
    );
  }

  private notConfirmable(payment: SubscriptionPayment): AppException {
    return new AppException(
      ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE,
      HttpStatus.CONFLICT,
      { status: payment.status, provider: payment.provider },
    );
  }

  private assertPaidAt(
    paidAt: Date,
    createdAt: Date,
    timezone: string,
    now: Date,
  ): void {
    const earliest = BillingPeriodCalculator.dayStart(createdAt, timezone);
    if (
      paidAt.getTime() > now.getTime() + PAYMENT_DATE_FUTURE_TOLERANCE_MS ||
      paidAt < earliest
    )
      throw new AppException(
        ErrorCode.SUBSCRIPTION_PAYMENT_DATE_INVALID,
        HttpStatus.BAD_REQUEST,
      );
  }
}
