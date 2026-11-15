import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AccessService } from '../../../access/services/access.service.js';
import { BrandService } from '../../../brand/services/brand.service.js';
import { LocationService } from '../../../location/services/location.service.js';
import { BillingOrigin } from '../../compute/billing-origin.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { BillingActor } from '../../interfaces/billing-actor.interface.js';
import { BillingLaunchResult } from '../../interfaces/billing-launch-result.interface.js';
import { SubscriptionBackfillRow } from '../../interfaces/subscription-backfill-row.interface.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionStartService } from '../../subscriptions/services/subscription-start.service.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';

const BATCH_SIZE = 500;

/** Launch of paid plans (plan section 13). Idempotent: run it again any time. */
@Injectable()
export class BillingLaunchService {
  private readonly logger = new Logger(BillingLaunchService.name);

  constructor(
    private readonly settings: BillingSettingsService,
    private readonly subscriptions: SubscriptionService,
    private readonly starts: SubscriptionStartService,
    private readonly brands: BrandService,
    private readonly access: AccessService,
    private readonly locations: LocationService,
  ) {}

  /**
   * Sets `launchedAt` (once) and gives every brand without a subscription a trial
   * to `trialEndsOn`, deleted brands too. Only the oldest brand of an owner whose
   * trial is free takes `trialUserId`.
   */
  async launch(
    trialEndsOn: string,
    actorId: string | null,
    now = new Date(),
  ): Promise<BillingLaunchResult> {
    if (Date.parse(`${trialEndsOn}T00:00:00Z`) <= now.getTime())
      throw new BadRequestException('trialEndsOn must be in the future');
    const settings = await this.settings.markLaunched(now, actorId);
    const actor = actorId
      ? BillingActors.admin(actorId)
      : BillingActors.system();

    const brands = await this.brands.findAllForBillingLaunch();
    const existing = await this.subscriptions.findExistingBrandIds(
      brands.map((b) => b.id),
    );
    const missing = brands.filter((b) => !existing.has(b.id)).map((b) => b.id);

    // Owners whose trial is spent or taken earlier in this pass.
    const takenUsers = new Set<string>();
    let created = 0;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      created += await this.backfillBatch(
        batch,
        trialEndsOn,
        settings.defaultCountryCode,
        takenUsers,
        actor,
        now,
      );
    }

    const after = await this.subscriptions.findExistingBrandIds(missing);
    const result: BillingLaunchResult = {
      launchedAt: settings.launchedAt ?? now,
      created,
      remaining: missing.length - after.size,
    };
    this.logger.log(
      `Billing launch: ${result.created} subscriptions created, ${result.remaining} brands left`,
    );
    return result;
  }

  private async backfillBatch(
    brandIds: string[],
    trialEndsOn: string,
    defaultCountryCode: string,
    takenUsers: Set<string>,
    actor: BillingActor,
    now: Date,
  ): Promise<number> {
    const [origins, owners] = await Promise.all([
      this.locations.findBillingOrigins(brandIds),
      this.access.findOwnerIdsByBrands(brandIds),
    ]);
    const spent = await this.subscriptions.findTrialUserIds(
      [...owners.values()].flat(),
    );
    for (const userId of spent) takenUsers.add(userId);

    // brandIds keep the oldest-first order, so an owner's first brand wins.
    const rows: SubscriptionBackfillRow[] = brandIds.map((brandId) => {
      const trialUserId =
        (owners.get(brandId) ?? []).find((id) => !takenUsers.has(id)) ?? null;
      if (trialUserId) takenUsers.add(trialUserId);
      const origin =
        origins.get(brandId) ?? BillingOrigin.fallback(defaultCountryCode);
      return {
        brandId,
        trialUserId,
        countryCode: origin.countryCode,
        timezone: origin.timezone,
      };
    });
    const created = await this.starts.backfill(rows, trialEndsOn, actor, now);
    await this.subscriptions.invalidateMany(brandIds);
    return created;
  }
}
