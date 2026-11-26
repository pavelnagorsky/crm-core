import { Injectable } from '@nestjs/common';
import { PriceChangeStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceChangeTarget } from '../engine/enums/price-change-target.enum.js';
import { PricingPriceChangeEntry } from '../engine/interfaces/pricing-price-change-entry.interface.js';

/** Reads the scheduled price changes for the price engine snapshot (a table pricing owns). */
@Injectable()
export class ScheduledPriceChangeReadService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * SCHEDULED changes of both catalogs by effective date, then creation. A row whose target is gone
   * (a null reference) or a level that became the default is left out: it can no longer
   * change a price.
   */
  async listForSnapshot(
    locationId: string,
    db: Prisma.TransactionClient = this.db,
  ): Promise<PricingPriceChangeEntry[]> {
    const changes = await db.priceChange.findMany({
      where: { locationId, status: PriceChangeStatus.SCHEDULED },
      include: { items: { include: { priceLevel: { select: { isDefault: true } } } } },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return changes.map((change) => ({
      id: change.id,
      effectiveDate: change.effectiveDate.toISOString().slice(0, 10),
      items: change.items
        .filter((item) => this.hasTarget(item) && !item.priceLevel?.isDefault)
        .map((item) => ({
          target: item.targetType as PriceChangeTarget,
          serviceId: item.serviceId,
          levelId: item.priceLevelId,
          staffId: item.staffId,
          bundleId: item.bundleId,
          productLocationId: item.productLocationId,
          price:
            item.afterPrice === null
              ? null
              : MoneyUtils.toMinor(item.afterPrice),
        })),
    }));
  }

  private hasTarget(item: {
    targetType: string;
    serviceId: string | null;
    priceLevelId: string | null;
    staffId: string | null;
    bundleId: string | null;
    productLocationId: string | null;
  }): boolean {
    switch (item.targetType) {
      case PriceChangeTarget.BASE:
        return item.serviceId !== null;
      case PriceChangeTarget.LEVEL:
        return item.serviceId !== null && item.priceLevelId !== null;
      case PriceChangeTarget.STAFF:
        return item.serviceId !== null && item.staffId !== null;
      case PriceChangeTarget.PRODUCT:
        return item.productLocationId !== null;
      default:
        return item.bundleId !== null;
    }
  }
}
