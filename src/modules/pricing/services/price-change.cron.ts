import { Injectable, Logger } from '@nestjs/common';
import { PriceChangeStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ExclusiveCron } from '../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import {
  PRICE_CHANGE_CRON,
  PRICE_CHANGE_TX_TIMEOUT_MS,
} from '../constants/price-change.constants.js';
import { PriceChangeApplied } from '../interfaces/price-change-applied.interface.js';
import {
  PRICE_CHANGE_SYSTEM_ACTOR,
  PriceChangeApplier,
} from './price-change-applier.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';

/**
 * Moves the scheduled changes whose date has come into the stored prices. The price engine
 * already reads them by date, so prices do not depend on this job running on time.
 */
@Injectable()
export class PriceChangeCron {
  private readonly logger = new Logger(PriceChangeCron.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
  ) {}

  @ExclusiveCron(PRICE_CHANGE_CRON)
  async applyDueChanges(now = new Date()): Promise<void> {
    // The eastmost timezone is a day ahead of UTC at most.
    const horizon = TimeUtils.addDaysStr(TimeUtils.zonedDateStr(now, 'UTC'), 1);
    const candidates = await this.db.priceChange.findMany({
      where: {
        status: PriceChangeStatus.SCHEDULED,
        effectiveDate: { lte: TimeUtils.dateOnly(horizon) },
      },
      distinct: ['locationId'],
      select: { locationId: true },
    });
    const locales = await this.locations.getLocalesByIds(
      candidates.map((candidate) => candidate.locationId),
    );
    for (const [locationId, { timezone }] of locales) {
      try {
        await this.applyLocation(
          locationId,
          TimeUtils.zonedDateStr(now, timezone),
          now,
        );
      } catch (error) {
        this.logger.error(
          `Price changes of location ${locationId} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** One change per transaction under the location lock; a failure stops this location only (later changes wait for the stuck one). */
  private async applyLocation(
    locationId: string,
    today: string,
    now: Date,
  ): Promise<void> {
    const due = await this.db.priceChange.findMany({
      where: {
        locationId,
        status: PriceChangeStatus.SCHEDULED,
        effectiveDate: { lte: TimeUtils.dateOnly(today) },
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const { id } of due) {
      let applied: PriceChangeApplied | null;
      try {
        applied = await this.db.$transaction(
          async (tx) => {
            await this.lock.lock(tx, locationId);
            return this.applier.apply(tx, id, now);
          },
          { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
        );
      } catch (error) {
        // Later changes build on this one, so applying them first would reorder prices.
        this.logger.error(
          `Price change ${id} of location ${locationId} failed and is stuck, the later changes of the location wait for it`,
          error instanceof Error ? error.stack : String(error),
        );
        return;
      }
      if (!applied) continue;
      // The change is committed: a failed announcement does not hold the next ones back.
      try {
        await this.applier.announce(applied, PRICE_CHANGE_SYSTEM_ACTOR);
      } catch (error) {
        this.logger.error(
          `Announcing price change ${id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
