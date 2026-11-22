import { Injectable } from '@nestjs/common';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { BundlePricingMode } from '../engine/enums/bundle-pricing-mode.enum.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';

/**
 * Loads what the price engine needs for one location. Every caller goes through this one
 * loader: shown prices read through the cache, a write that fixes a price reads fresh data.
 */
@Injectable()
export class PricingSnapshotService {
  constructor(private readonly serviceCatalog: ServiceCatalogFacade) {}

  async load(
    locationId: string,
    consistency: ReadConsistency,
  ): Promise<PricingSnapshot> {
    const catalog = await this.serviceCatalog.loadCatalogSnapshot(
      locationId,
      consistency,
    );
    return {
      services: catalog.services.map((service) => ({
        id: service.id,
        price: MoneyUtils.toMinor(service.price),
        // TODO(stage 2, loader task): level prices, levels and staff from the database.
        levelPrices: {},
      })),
      bundles: catalog.bundles.map((bundle) => ({
        id: bundle.id,
        pricingMode: bundle.pricingMode as BundlePricingMode,
        fixedPrice:
          bundle.fixedPrice === null
            ? null
            : MoneyUtils.toMinor(bundle.fixedPrice),
        serviceIds: bundle.items.map((item) => item.serviceId),
      })),
      levels: [],
      staff: [],
    };
  }
}
