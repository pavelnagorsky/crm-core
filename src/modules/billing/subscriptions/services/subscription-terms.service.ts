import { Injectable } from '@nestjs/common';
import { Prisma, Subscription, SubscriptionEventType } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { AccessDatesCalculator } from '../../compute/access-dates.calculator.js';
import { BillingPeriodCalculator } from '../../compute/billing-period.calculator.js';
import { GRACE_EXTENSION_RESET } from '../../constants/grace-extension-reset.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionService } from './subscription.service.js';

type Tx = Prisma.TransactionClient;

/** Admin changes outside payments: trial end, country, suspension (plan section 8.3). */
@Injectable()
export class SubscriptionTermsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly subscriptions: SubscriptionService,
    private readonly events: SubscriptionEventService,
  ) {}

  /** +days to the trial; an ended trial is extended from today. */
  extendTrial(
    brandId: string,
    days: number,
    reason: string,
    actor: BillingActor,
    now = new Date(),
  ): Promise<Subscription> {
    return this.subscriptions.withLock(brandId, (subscription, tx) => {
      const tz = subscription.timezone;
      const base =
        subscription.trialEndsAt > now
          ? subscription.trialEndsAt
          : BillingPeriodCalculator.dayStart(now, tz);
      return this.writeTrialEnd(
        subscription,
        TimeUtils.addDaysInTz(base, days, tz),
        actor,
        tx,
        { days, reason },
      );
    });
  }

  /**
   * Bulk trial extension of subscriptions without payments (plan section 8.3):
   * trialEndsAt = max(trialEndsAt, until). Returns the number of brands.
   */
  async extendTrials(
    until: string,
    reason: string,
    dryRun: boolean,
    actor: BillingActor,
  ): Promise<number> {
    const candidates = await this.db.subscription.findMany({
      where: { paidUntil: null, suspendedAt: null },
      select: { brandId: true, timezone: true, trialEndsAt: true },
    });
    const due = candidates.filter(
      (s) => s.trialEndsAt < TimeUtils.zonedDateStart(until, s.timezone),
    );
    if (dryRun || !due.length) return due.length;

    const changed: string[] = [];
    for (const { brandId } of due) {
      await this.db.$transaction(async (tx) => {
        const subscription = await this.subscriptions.lock(brandId, tx);
        if (!subscription || subscription.paidUntil || subscription.suspendedAt)
          return;
        const newEnd = TimeUtils.zonedDateStart(until, subscription.timezone);
        if (subscription.trialEndsAt >= newEnd) return;
        await this.writeTrialEnd(subscription, newEnd, actor, tx, {
          until,
          reason,
          bulk: true,
        });
        changed.push(brandId);
      });
    }
    await this.subscriptions.invalidateMany(changed);
    return changed.length;
  }

  changeCountry(
    brandId: string,
    countryCode: string,
    reason: string,
    actor: BillingActor,
  ): Promise<Subscription> {
    return this.subscriptions.withLock(brandId, async (subscription, tx) => {
      const result = await tx.subscription.update({
        where: { id: subscription.id },
        data: { countryCode },
      });
      await this.events.record(
        subscription,
        SubscriptionEventType.COUNTRY_CHANGED,
        actor,
        { from: subscription.countryCode, to: countryCode, reason },
        tx,
      );
      return result;
    });
  }

  suspend(
    brandId: string,
    reason: string,
    actor: BillingActor,
    now = new Date(),
  ): Promise<Subscription> {
    return this.subscriptions.withLock(brandId, async (subscription, tx) => {
      if (subscription.suspendedAt) return subscription;
      const result = await tx.subscription.update({
        where: { id: subscription.id },
        data: { suspendedAt: now, suspendReason: reason },
      });
      await this.events.record(
        subscription,
        SubscriptionEventType.SUSPENDED,
        actor,
        { reason },
        tx,
      );
      return result;
    });
  }

  resume(brandId: string, actor: BillingActor): Promise<Subscription> {
    return this.subscriptions.withLock(brandId, async (subscription, tx) => {
      if (!subscription.suspendedAt) return subscription;
      const result = await tx.subscription.update({
        where: { id: subscription.id },
        data: { suspendedAt: null, suspendReason: null },
      });
      await this.events.record(
        subscription,
        SubscriptionEventType.RESUMED,
        actor,
        {
          suspendedAt: subscription.suspendedAt,
          reason: subscription.suspendReason,
        },
        tx,
      );
      return result;
    });
  }

  private async writeTrialEnd(
    subscription: Subscription,
    trialEndsAt: Date,
    actor: BillingActor,
    tx: Tx,
    payload: Record<string, unknown>,
  ): Promise<Subscription> {
    const accessEndsAt = AccessDatesCalculator.accessEndsAt(
      trialEndsAt,
      subscription.paidUntil,
    );
    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        trialEndsAt,
        accessEndsAt,
        ...(accessEndsAt.getTime() !== subscription.accessEndsAt.getTime()
          ? GRACE_EXTENSION_RESET
          : {}),
      },
    });
    await this.events.record(
      subscription,
      SubscriptionEventType.TRIAL_EXTENDED,
      actor,
      { ...payload, trialEndsAtBefore: subscription.trialEndsAt, trialEndsAt },
      tx,
    );
    return updated;
  }
}
