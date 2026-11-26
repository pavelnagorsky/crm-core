import { PriceRuleTargetType } from '@prisma/client';
import { PriceRuleCatalogCoverage } from '../interfaces/price-rule-catalog-coverage.interface.js';
import { PriceRuleTargetRef } from '../interfaces/price-rule-target-ref.interface.js';

/**
 * Distinct services a rule can touch. Applies to all: every service except the excluded
 * ones and those of excluded categories. Otherwise: the listed services, the services of the
 * listed categories and the services inside the listed bundles. An excluded bundle does not
 * take its services out: they are still priced on their own.
 */
export function affectedServiceCount(
  rule: { appliesToAllServices: boolean; targets: readonly PriceRuleTargetRef[] },
  catalog: PriceRuleCatalogCoverage,
): number {
  const idsOf = (type: PriceRuleTargetType, excluded: boolean): Set<string> =>
    new Set(
      rule.targets
        .filter(
          (target) => target.type === type && target.excluded === excluded,
        )
        .map((target) => target.id),
    );
  if (rule.appliesToAllServices) {
    const services = idsOf(PriceRuleTargetType.SERVICE, true);
    const categories = idsOf(PriceRuleTargetType.SERVICE_CATEGORY, true);
    return catalog.services.filter(
      (service) =>
        !services.has(service.id) &&
        !(service.categoryId !== null && categories.has(service.categoryId)),
    ).length;
  }
  const services = idsOf(PriceRuleTargetType.SERVICE, false);
  const categories = idsOf(PriceRuleTargetType.SERVICE_CATEGORY, false);
  const bundles = idsOf(PriceRuleTargetType.BUNDLE, false);
  const bundleServices = new Set(
    catalog.bundles
      .filter((bundle) => bundles.has(bundle.id))
      .flatMap((bundle) => bundle.serviceIds),
  );
  return catalog.services.filter(
    (service) =>
      services.has(service.id) ||
      (service.categoryId !== null && categories.has(service.categoryId)) ||
      bundleServices.has(service.id),
  ).length;
}
