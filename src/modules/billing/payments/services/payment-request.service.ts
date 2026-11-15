import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BillingActorRole,
  Prisma,
  Subscription,
  SubscriptionEventType,
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { EventPayload } from '../../compute/event-payload.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { PaymentCancelOptions } from '../../interfaces/payment-cancel-options.interface.js';
import { PaymentRequestInput } from '../../interfaces/payment-request-input.interface.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionEventService } from '../../subscriptions/services/subscription-event.service.js';
import { SubscriptionPeriodService } from '../../subscriptions/services/subscription-period.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import { PaymentProviderRegistry } from '../payment-provider.registry.js';
import { SubscriptionPaymentService } from './subscription-payment.service.js';

type Tx = Prisma.TransactionClient;

/** Lifecycle of a PENDING request: created, canceled or expired (plan section 4.2). */
@Injectable()
export class PaymentRequestService {
  constructor(
    private readonly db: DatabaseService,
    private readonly payments: SubscriptionPaymentService,
    private readonly subscriptions: SubscriptionService,
    private readonly events: SubscriptionEventService,
    private readonly periods: SubscriptionPeriodService,
    private readonly settings: BillingSettingsService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  /**
   * Request for renewal (plan section 4.2, step 2). The caller has locked the row
   * and checked the plan, price and usage.
   */
  async create(
    subscription: Subscription,
    input: PaymentRequestInput,
    tx: Tx,
    now = new Date(),
  ): Promise<SubscriptionPayment> {
    const settings = await this.settings.read(tx);
    const provider = this.providers.getOwnerInitiated(settings.paymentProvider);
    await this.cancelPending(subscription, input.actor, 'replaced', tx);
    const payment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        brandId: subscription.brandId,
        planId: input.plan.id,
        planName: input.plan.name,
        billingPeriod: input.billingPeriod,
        countryCode: input.price.countryCode,
        currency: input.price.currency,
        amount: MoneyUtils.quantize(input.price.amount),
        provider: provider.code,
        ownerComment: input.comment,
        expiresAt: TimeUtils.addDaysInTz(
          now,
          settings.paymentRequestTtlDays,
          subscription.timezone,
        ),
        createdById: input.actor.id,
        createdByRole: input.actor.role,
      },
    });
    await this.events.record(
      subscription,
      SubscriptionEventType.PAYMENT_CREATED,
      input.actor,
      EventPayload.payment(payment),
      tx,
    );
    if (provider.capabilities.adminConfirmable)
      await this.periods.extendGraceForRequest(
        subscription,
        input.actor,
        tx,
        now,
      );
    return payment;
  }

  /** Cancels the open request of the subscription; returns it when there was one. */
  async cancelPending(
    subscription: Pick<Subscription, 'id' | 'brandId'>,
    actor: BillingActor,
    reason: string,
    tx: Tx,
  ): Promise<SubscriptionPayment | null> {
    const pending = await tx.subscriptionPayment.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: SubscriptionPaymentStatus.PENDING,
      },
    });
    if (!pending) return null;
    const canceled = await tx.subscriptionPayment.update({
      where: { id: pending.id },
      data: {
        status: SubscriptionPaymentStatus.CANCELED,
        failureReason: reason,
      },
    });
    await this.events.record(
      subscription,
      SubscriptionEventType.PAYMENT_CANCELED,
      actor,
      { ...EventPayload.payment(canceled), reason },
      tx,
    );
    return canceled;
  }

  /** Owner (brandId set) or admin cancels a PENDING request. */
  async cancel(
    id: string,
    actor: BillingActor,
    options: PaymentCancelOptions = {},
  ): Promise<SubscriptionPayment> {
    const payment = options.brandId
      ? await this.payments.findForBrand(options.brandId, id)
      : await this.payments.findById(id);
    return this.subscriptions.withLock(payment.brandId, async (_, tx) => {
      const { count } = await tx.subscriptionPayment.updateMany({
        where: { id, status: SubscriptionPaymentStatus.PENDING },
        data: {
          status: SubscriptionPaymentStatus.CANCELED,
          failureReason:
            actor.role === BillingActorRole.OWNER
              ? 'canceled_by_owner'
              : 'canceled_by_admin',
          adminNote: options.adminNote ?? undefined,
        },
      });
      const current = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id },
      });
      if (!count)
        throw new AppException(
          ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CANCELABLE,
          HttpStatus.CONFLICT,
          { status: current.status },
        );
      await this.events.record(
        { id: current.subscriptionId, brandId: current.brandId },
        SubscriptionEventType.PAYMENT_CANCELED,
        actor,
        { ...EventPayload.payment(current), reason: current.failureReason },
        tx,
      );
      return current;
    });
  }

  /** Brand deletion (plan section 4.7): the open request is canceled in the same transaction. */
  async cancelOpenPayments(brandId: string, tx: Tx): Promise<void> {
    const subscription = await this.subscriptions.lock(brandId, tx);
    if (!subscription) return;
    await this.cancelPending(
      subscription,
      BillingActors.system(),
      'brand_deleted',
      tx,
    );
  }

  /** PENDING past expiresAt → EXPIRED in one statement. Returns the expired payments. */
  async expireDue(now = new Date()): Promise<SubscriptionPayment[]> {
    const expired = await this.db.$transaction(async (tx) => {
      const rows = await tx.subscriptionPayment.updateManyAndReturn({
        where: {
          status: SubscriptionPaymentStatus.PENDING,
          expiresAt: { lt: now },
        },
        data: { status: SubscriptionPaymentStatus.EXPIRED },
      });
      await this.events.recordMany(
        rows.map((p) => ({
          subscription: { id: p.subscriptionId, brandId: p.brandId },
          payload: EventPayload.payment(p),
        })),
        SubscriptionEventType.PAYMENT_EXPIRED,
        BillingActors.system(),
        tx,
      );
      return rows;
    });
    await this.subscriptions.invalidateMany(expired.map((p) => p.brandId));
    return expired;
  }
}
