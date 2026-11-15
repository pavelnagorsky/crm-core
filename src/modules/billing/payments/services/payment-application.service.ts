import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionPayment } from '@prisma/client';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { ComplimentaryLength } from '../../interfaces/complimentary-length.type.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { SubscriptionPeriodService } from '../../subscriptions/services/subscription-period.service.js';

type Tx = Prisma.TransactionClient;

/** Applies a PAID payment to the locked subscription and stamps the period it bought. */
@Injectable()
export class PaymentApplicationService {
  constructor(private readonly periods: SubscriptionPeriodService) {}

  async apply(
    subscription: SubscriptionWithPlan,
    payment: SubscriptionPayment,
    actor: BillingActor,
    tx: Tx,
    now: Date,
    complimentary?: ComplimentaryLength,
  ): Promise<SubscriptionPayment> {
    const period = await this.periods.applyPayment(
      subscription,
      payment,
      actor,
      tx,
      now,
      complimentary,
    );
    return tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { periodStart: period.periodStart, periodEnd: period.periodEnd },
    });
  }
}
