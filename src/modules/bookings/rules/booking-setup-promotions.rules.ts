import {
  BundlePricingMode,
  PriceRuleTargetType,
  PriceValueType,
  Prisma,
} from '@prisma/client';
import { PublicPromotionView } from '../../pricing/interfaces/public-promotion-view.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingPromotionLabel } from '../interfaces/booking-promotion-label.interface.js';

type Target = PublicPromotionView['targets'][number];

/** Whether one of these targets names this service, its category or this bundle. */
function names(
  targets: readonly Target[],
  item: { serviceId?: string; categoryId?: string | null; bundleId?: string },
): boolean {
  return targets.some(
    (target) =>
      (target.type === PriceRuleTargetType.SERVICE &&
        target.id === item.serviceId) ||
      (target.type === PriceRuleTargetType.SERVICE_CATEGORY &&
        item.categoryId != null &&
        target.id === item.categoryId) ||
      (target.type === PriceRuleTargetType.BUNDLE && target.id === item.bundleId),
  );
}

/** "All" minus the exclusions, or the listed targets, as the price engine matches them. */
function reaches(
  promotion: PublicPromotionView,
  item: { serviceId?: string; categoryId?: string | null; bundleId?: string },
): boolean {
  const included = promotion.targets.filter((target) => !target.excluded);
  const excluded = promotion.targets.filter((target) => target.excluded);
  return promotion.appliesToAllServices
    ? !names(excluded, item)
    : names(included, item);
}

/**
 * The label of an item with promotions: the public name of the only one, else "Скидки до N%"
 * with the biggest percent; an amount counts as its percent of the "from" price, rounded down.
 */
function label(
  promotions: readonly PublicPromotionView[],
  priceFrom: Prisma.Decimal,
): BookingPromotionLabel | null {
  if (promotions.length === 0) return null;
  const promotionIds = promotions.map((promotion) => promotion.id);
  if (promotions.length === 1)
    return { label: promotions[0].publicName, promotionIds };
  const percent = Math.max(
    ...promotions.map((promotion) =>
      promotion.valueType === PriceValueType.PERCENT
        ? Math.floor(promotion.value.toNumber())
        : priceFrom.isZero()
          ? 0
          : Math.min(
              100,
              Math.floor(
                promotion.value.mul(100).div(priceFrom).toNumber(),
              ),
            ),
    ),
  );
  return { label: `Скидки до ${percent}%`, promotionIds };
}

/**
 * Promotion labels of the booking page catalog. A service is reached by itself or its
 * category; a FIXED bundle is one package, reached only as a bundle (or by "all"); a SUM bundle
 * also by the services in it.
 */
export function bookingSetupPromotionLabels(
  promotions: readonly PublicPromotionView[],
  catalog: Pick<BookingServiceCatalog, 'services' | 'bundles'>,
  priceFrom: {
    services: ReadonlyMap<string, { priceFrom: Prisma.Decimal }>;
    bundles: ReadonlyMap<string, { priceFrom: Prisma.Decimal }>;
  },
): {
  services: Map<string, BookingPromotionLabel | null>;
  bundles: Map<string, BookingPromotionLabel | null>;
} {
  const categoryOf = new Map(
    catalog.services.map((service) => [service.id, service.categoryId]),
  );
  const zero = new Prisma.Decimal(0);
  const services = new Map(
    catalog.services.map((service) => [
      service.id,
      label(
        promotions.filter((promotion) =>
          reaches(promotion, {
            serviceId: service.id,
            categoryId: service.categoryId,
          }),
        ),
        priceFrom.services.get(service.id)?.priceFrom ?? zero,
      ),
    ]),
  );
  const bundles = new Map(
    catalog.bundles.map((bundle) => {
      const fixed = bundle.pricingMode === BundlePricingMode.FIXED;
      const matched = promotions.filter(
        (promotion) =>
          reaches(promotion, { bundleId: bundle.id }) ||
          (!fixed &&
            bundle.items.some((item) =>
              reaches(promotion, {
                serviceId: item.serviceId,
                categoryId: categoryOf.get(item.serviceId) ?? null,
                bundleId: bundle.id,
              }),
            )),
      );
      return [
        bundle.id,
        label(matched, priceFrom.bundles.get(bundle.id)?.priceFrom ?? zero),
      ] as const;
    }),
  );
  return { services, bundles };
}
