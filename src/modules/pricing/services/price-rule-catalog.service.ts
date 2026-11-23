import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceRuleTargetType } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
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

/** What the catalog says about rule targets: do they exist in the location, and how are they called. */
@Injectable()
export class PriceRuleCatalogService {
  constructor(private readonly catalog: ServiceCatalogFacade) {}

  /** Titles of the targets by `type:id`; a target that is gone is absent. */
  async targetNames(
    locationId: string,
    targets: readonly Pick<PriceRuleTargetRef, 'type' | 'id'>[],
  ): Promise<Map<string, string>> {
    const [services, categories, bundles] = await Promise.all([
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
    return names;
  }

  /** 400 PRICE_RULE_INVALID (field targets) when a target is not a service, category or bundle of the location. */
  async assertTargetsInLocation(
    locationId: string,
    targets: readonly PriceRuleTargetRef[],
  ): Promise<void> {
    if (targets.length === 0) return;
    const names = await this.targetNames(locationId, targets);
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
