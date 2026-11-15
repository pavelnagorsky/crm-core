import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Subscription, SubscriptionEventType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingPeriodCalculator } from '../../compute/billing-period.calculator.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { SubscriptionBackfillRow } from '../../interfaces/subscription-backfill-row.interface.js';
import { SubscriptionOrigin } from '../../interfaces/subscription-origin.interface.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionService } from './subscription.service.js';

type Tx = Prisma.TransactionClient;

/** Creates subscriptions: a new brand, a pilot brand and the launch backfill (plan section 4.1). */
@Injectable()
export class SubscriptionStartService {
  constructor(
    private readonly db: DatabaseService,
    private readonly subscriptions: SubscriptionService,
    private readonly events: SubscriptionEventService,
    private readonly settings: BillingSettingsService,
  ) {}

  /**
   * New brand after launch, inside BrandService.create. Settings are read in the
   * transaction: a brand created right after launch must not miss its subscription.
   */
  async start(
    brandId: string,
    ownerUserId: string,
    origin: SubscriptionOrigin,
    tx: Tx,
    now = new Date(),
  ): Promise<void> {
    const settings = await this.settings.read(tx);
    if (!settings.launchedAt) return;
    const tz = origin.timezone;
    const dayStart = BillingPeriodCalculator.dayStart(now, tz);
    const trialEndsAt = TimeUtils.addDaysInTz(dayStart, settings.trialDays, tz);
    const base = {
      brandId,
      countryCode: origin.countryCode,
      timezone: tz,
      trialStartedAt: now,
    };
    const actor = BillingActors.owner(ownerUserId);

    // The partial unique index on trialUserId settles a race of two first brands.
    const [withTrial] = await tx.subscription.createManyAndReturn({
      data: [
        {
          ...base,
          id: randomUUID(),
          trialUserId: ownerUserId,
          trialEndsAt,
          accessEndsAt: trialEndsAt,
        },
      ],
      skipDuplicates: true,
    });
    if (withTrial) {
      await this.events.record(
        withTrial,
        SubscriptionEventType.TRIAL_STARTED,
        actor,
        { trialEndsAt },
        tx,
      );
      return;
    }
    const usedInBrandId = await this.subscriptions.findTrialBrandId(
      ownerUserId,
      tx,
    );
    const withoutTrial = await tx.subscription.create({
      data: { ...base, trialEndsAt: dayStart, accessEndsAt: dayStart },
    });
    await this.events.record(
      withoutTrial,
      SubscriptionEventType.TRIAL_SKIPPED,
      actor,
      { trialUsedInBrandId: usedInBrandId },
      tx,
    );
  }

  /** Pilot: one brand before launch (plan section 4.1). */
  async startPilot(
    brandId: string,
    origin: SubscriptionOrigin,
    trialEndsOn: string,
    actor: BillingActor,
    now = new Date(),
  ): Promise<SubscriptionWithPlan> {
    const trialEndsAt = TimeUtils.zonedDateStart(trialEndsOn, origin.timezone);
    if (trialEndsAt <= now)
      throw new BadRequestException('trialEndsOn must be in the future');
    await this.db.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { brandId } });
      if (existing)
        throw new AppException(
          ErrorCode.SUBSCRIPTION_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      const created = await tx.subscription.create({
        data: {
          brandId,
          countryCode: origin.countryCode,
          timezone: origin.timezone,
          trialStartedAt: now,
          trialEndsAt,
          accessEndsAt: trialEndsAt,
        },
      });
      await this.events.record(
        created,
        SubscriptionEventType.TRIAL_STARTED,
        actor,
        { trialEndsAt, source: 'pilot' },
        tx,
      );
    });
    await this.subscriptions.invalidate(brandId);
    return this.subscriptions.findByBrandOrThrow(brandId);
  }

  /**
   * Launch backfill: INSERT ... ON CONFLICT DO NOTHING. A row whose trialUserId got
   * taken meanwhile is inserted again without it. Returns the number of new rows.
   */
  async backfill(
    rows: SubscriptionBackfillRow[],
    trialEndsOn: string,
    actor: BillingActor,
    now = new Date(),
  ): Promise<number> {
    const created = await this.insertBackfill(
      rows.map((r) => this.backfillData(r, trialEndsOn, now, true)),
      actor,
    );
    const createdIds = new Set(created.map((s) => s.brandId));
    const skipped = rows.filter((r) => !createdIds.has(r.brandId));
    if (!skipped.length) return created.length;

    const existing = await this.subscriptions.findExistingBrandIds(
      skipped.map((r) => r.brandId),
    );
    const retried = await this.insertBackfill(
      skipped
        .filter((r) => !existing.has(r.brandId))
        .map((r) => this.backfillData(r, trialEndsOn, now, false)),
      actor,
    );
    return created.length + retried.length;
  }

  private backfillData(
    row: SubscriptionBackfillRow,
    trialEndsOn: string,
    now: Date,
    withTrialUser: boolean,
  ): Prisma.SubscriptionCreateManyInput {
    const trialEndsAt = TimeUtils.zonedDateStart(trialEndsOn, row.timezone);
    return {
      id: randomUUID(),
      brandId: row.brandId,
      countryCode: row.countryCode,
      timezone: row.timezone,
      trialStartedAt: now,
      trialEndsAt,
      accessEndsAt: trialEndsAt,
      trialUserId: withTrialUser ? row.trialUserId : null,
    };
  }

  private insertBackfill(
    data: Prisma.SubscriptionCreateManyInput[],
    actor: BillingActor,
  ): Promise<Subscription[]> {
    if (!data.length) return Promise.resolve([]);
    return this.db.$transaction(async (tx) => {
      const created = await tx.subscription.createManyAndReturn({
        data,
        skipDuplicates: true,
      });
      await this.events.recordMany(
        created.map((s) => ({
          subscription: s,
          payload: { trialEndsAt: s.trialEndsAt, source: 'launch' },
        })),
        SubscriptionEventType.TRIAL_STARTED,
        actor,
        tx,
      );
      return created;
    });
  }
}
