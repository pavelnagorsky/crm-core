import { Injectable } from '@nestjs/common';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PRICING_SNAPSHOT_CACHE } from '../cache/pricing-snapshot.cache.js';
import { BundlePricingMode } from '../engine/enums/bundle-pricing-mode.enum.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { toPricingRuleEntry } from '../rules/price-rule-entry.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { PriceRuleReadService } from './price-rule-read.service.js';
import { ScheduledPriceChangeReadService } from './scheduled-price-change-read.service.js';

/**
 * Loads what the price engine needs for one location. Every caller goes through this one
 * loader: shown prices read through the cache, a write that fixes a price reads fresh data.
 */
@Injectable()
export class PricingSnapshotService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly levels: PriceLevelReadService,
    private readonly rules: PriceRuleReadService,
    private readonly priceChanges: ScheduledPriceChangeReadService,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
    private readonly cache: AppCacheService,
  ) {}

  async load(
    locationId: string,
    consistency: ReadConsistency,
  ): Promise<PricingSnapshot> {
    if (consistency === ReadConsistency.FRESH)
      return this.loadFresh(locationId);
    const { brandId } = await this.locations.getBookingSettings(locationId);
    return this.cache.getOrLoad(
      PRICING_SNAPSHOT_CACHE,
      { brandId, locationId },
      () => this.loadFresh(locationId),
    );
  }

  /**
   * Reads every source fresh, also when it fills the cache: a stale catalog or directory
   * entry of another replica must not be kept for a day inside the snapshot.
   */
  private async loadFresh(locationId: string): Promise<PricingSnapshot> {
    const [
      catalog,
      levels,
      levelPrices,
      rules,
      roundingStep,
      staff,
      locale,
      priceChanges,
    ] = await Promise.all([
      this.serviceCatalog.loadCatalogSnapshot(
        locationId,
        ReadConsistency.FRESH,
      ),
      this.levels.listLevels(locationId),
      this.levels.listLevelPrices(locationId),
      this.rules.listForSnapshot(locationId),
      this.locations.findPriceRoundingStep(locationId),
      this.staff.listPricingProfiles(locationId),
      this.locations.getLocale(locationId),
      this.priceChanges.listForSnapshot(locationId),
    ]);
    const levelPricesByService = new Map<string, Record<string, number>>();
    for (const row of levelPrices) {
      const prices = levelPricesByService.get(row.serviceId) ?? {};
      prices[row.priceLevelId] = MoneyUtils.toMinor(row.price);
      levelPricesByService.set(row.serviceId, prices);
    }
    return {
      services: catalog.services.map((service) => ({
        id: service.id,
        categoryId: service.categoryId,
        price: MoneyUtils.toMinor(service.price),
        levelPrices: levelPricesByService.get(service.id) ?? {},
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
      levels: levels.map((level) => ({
        id: level.id,
        name: level.name,
        isDefault: level.isDefault,
      })),
      staff: staff.map((profile) => ({
        id: profile.id,
        name: profile.name,
        levelId: profile.priceLevelId,
        servicePrices: Object.fromEntries(
          profile.servicePrices.map(({ serviceId, price }) => [
            serviceId,
            MoneyUtils.toMinor(price),
          ]),
        ),
      })),
      rules: rules.map(toPricingRuleEntry),
      roundingStep: MoneyUtils.toMinor(roundingStep),
      timezone: locale.timezone,
      priceChanges,
    };
  }
}
