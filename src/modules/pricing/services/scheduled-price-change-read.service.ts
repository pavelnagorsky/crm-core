import { Injectable } from '@nestjs/common';
import { Prisma, ServicePriceChangeStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServicePriceChangeTarget } from '../engine/enums/service-price-change-target.enum.js';
import { PricingPriceChangeEntry } from '../engine/interfaces/pricing-price-change-entry.interface.js';

/** Reads the scheduled price changes for the price engine snapshot (a table pricing owns). */
@Injectable()
export class ScheduledPriceChangeReadService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * SCHEDULED changes by effective date, then creation. A row whose target is gone
   * (a null reference) or a level that became the default is left out: it can no longer
   * change a price.
   */
  async listForSnapshot(
    locationId: string,
    db: Prisma.TransactionClient = this.db,
  ): Promise<PricingPriceChangeEntry[]> {
    const changes = await db.servicePriceChange.findMany({
      where: { locationId, status: ServicePriceChangeStatus.SCHEDULED },
      include: { items: { include: { priceLevel: { select: { isDefault: true } } } } },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return changes.map((change) => ({
      id: change.id,
      effectiveDate: change.effectiveDate.toISOString().slice(0, 10),
      items: change.items
        .filter((item) => this.hasTarget(item) && !item.priceLevel?.isDefault)
        .map((item) => ({
          target: item.targetType as ServicePriceChangeTarget,
          serviceId: item.serviceId,
          levelId: item.priceLevelId,
          staffId: item.staffId,
          bundleId: item.bundleId,
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
  }): boolean {
    switch (item.targetType) {
      case ServicePriceChangeTarget.BASE:
        return item.serviceId !== null;
      case ServicePriceChangeTarget.LEVEL:
        return item.serviceId !== null && item.priceLevelId !== null;
      case ServicePriceChangeTarget.STAFF:
        return item.serviceId !== null && item.staffId !== null;
      default:
        return item.bundleId !== null;
    }
  }
}
