import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceRuleTargetType } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { isProductTarget } from '../rules/price-rule-input.rules.js';
import { PriceRuleCatalogCoverage } from '../interfaces/price-rule-catalog-coverage.interface.js';
import { PriceRuleTargetRef } from '../interfaces/price-rule-target-ref.interface.js';
import { PriceRuleTargetView } from '../interfaces/price-rule-target-view.interface.js';

const idsOfType = (
  targets: readonly Pick<PriceRuleTargetRef, 'type' | 'id'>[],
  type: PriceRuleTargetType,
): string[] => [
  ...new Set(
    targets.filter((target) => target.type === type).map((target) => target.id),
  ),
];

/**
 * What the catalogs say about rule targets: do they exist in the location (services) or its
 * brand (products), and how are they called.
 */
@Injectable()
export class PriceRuleCatalogService {
  constructor(
    private readonly catalog: ServiceCatalogFacade,
    private readonly products: ProductsService,
    private readonly locations: LocationService,
  ) {}

  /** Titles of the targets by `type:id`; a target that is gone is absent. */
  async targetNames(
    locationId: string,
    targets: readonly Pick<PriceRuleTargetRef, 'type' | 'id'>[],
  ): Promise<Map<string, string>> {
    const [services, categories, bundles, products] = await Promise.all([
      this.catalog.findServicePriceEntries(
        locationId,
        idsOfType(targets, PriceRuleTargetType.SERVICE),
      ),
      this.catalog.findCategoryNames(
        locationId,
        idsOfType(targets, PriceRuleTargetType.SERVICE_CATEGORY),
      ),
      this.catalog.findBundleTitlesInLocation(
        locationId,
        idsOfType(targets, PriceRuleTargetType.BUNDLE),
      ),
      this.products.findNames(
        idsOfType(targets, PriceRuleTargetType.PRODUCT),
        idsOfType(targets, PriceRuleTargetType.PRODUCT_CATEGORY),
      ),
    ]);
    const names = new Map<string, string>();
    for (const service of services)
      names.set(
        targetKey(PriceRuleTargetType.SERVICE, service.id),
        service.title,
      );
    for (const [id, name] of categories)
      names.set(targetKey(PriceRuleTargetType.SERVICE_CATEGORY, id), name);
    for (const [id, title] of bundles)
      names.set(targetKey(PriceRuleTargetType.BUNDLE, id), title);
    for (const product of products.products)
      names.set(targetKey(PriceRuleTargetType.PRODUCT, product.id), product.name);
    for (const category of products.categories)
      names.set(
        targetKey(PriceRuleTargetType.PRODUCT_CATEGORY, category.id),
        category.name,
      );
    return names;
  }

  /**
   * 400 PRICE_RULE_INVALID (field targets) when a target is not a service, category or bundle
   * of the location, or not a product of its brand that is for sale and has a row in the
   * location, or not a product category of its brand.
   */
  async assertTargetsInLocation(
    locationId: string,
    targets: readonly PriceRuleTargetRef[],
  ): Promise<void> {
    if (targets.length === 0) return;
    const serviceTargets = targets.filter(
      (target) => !isProductTarget(target.type),
    );
    const productTargets = targets.filter((target) =>
      isProductTarget(target.type),
    );
    const names =
      serviceTargets.length === 0
        ? new Map<string, string>()
        : await this.targetNames(locationId, serviceTargets);
    if (productTargets.length > 0) {
      const { brandId } = await this.locations.getBookingSettings(locationId);
      const found = await this.products.findRuleTargets(
        brandId,
        locationId,
        idsOfType(productTargets, PriceRuleTargetType.PRODUCT),
        idsOfType(productTargets, PriceRuleTargetType.PRODUCT_CATEGORY),
      );
      for (const product of found.products)
        names.set(targetKey(PriceRuleTargetType.PRODUCT, product.id), product.name);
      for (const category of found.categories)
        names.set(
          targetKey(PriceRuleTargetType.PRODUCT_CATEGORY, category.id),
          category.name,
        );
    }
    if (targets.some((target) => !names.has(targetKey(target.type, target.id))))
      throw new AppException(
        ErrorCode.PRICE_RULE_INVALID,
        HttpStatus.BAD_REQUEST,
        { field: 'targets' },
      );
  }

  /** Targets with their current names. */
  async nameTargets(
    locationId: string,
    targets: readonly PriceRuleTargetRef[],
  ): Promise<PriceRuleTargetView[]> {
    const names = await this.targetNames(locationId, targets);
    return targets.map((target) => ({
      ...target,
      name: names.get(targetKey(target.type, target.id)) ?? null,
    }));
  }

  /**
   * Services and bundle contents the coverage count runs on: the bookable catalog, read
   * through the cache (a count shown in a list does not need the freshest read).
   */
  async loadCoverage(locationId: string): Promise<PriceRuleCatalogCoverage> {
    const snapshot = await this.catalog.loadCatalogSnapshot(
      locationId,
      ReadConsistency.CACHED,
    );
    return {
      services: snapshot.services.map((service) => ({
        id: service.id,
        categoryId: service.categoryId,
      })),
      bundles: snapshot.bundles.map((bundle) => ({
        id: bundle.id,
        serviceIds: bundle.items.map((item) => item.serviceId),
      })),
    };
  }
}

export function targetKey(type: PriceRuleTargetType, id: string): string {
  return `${type}:${id}`;
}
