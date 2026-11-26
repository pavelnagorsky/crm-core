import { BundlePricingMode as PrismaBundlePricingMode } from '@prisma/client';
import { PriceRange } from '../../pricing/engine/interfaces/price-range.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingPriceRange } from '../interfaces/booking-price-range.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingSetupPrices } from '../interfaces/booking-setup-prices.interface.js';
import { CatalogListPrices } from '../interfaces/catalog-list-prices.interface.js';
import { BookingStaffServicePrice } from '../interfaces/booking-staff-service-price.interface.js';
import { BookingStaff } from '../../staff/interfaces/booking-staff.interface.js';

/**
 * Prices the booking page shows (docs/pricing-stage3-api.md): "from - to" over the online
 * booking dates, surcharges included. A service costs from the lowest to the highest price
 * among the staff who perform it, each over the dates; a staff member has a range per
 * service. A service nobody performs costs its base price over the dates. A FIXED bundle is
 * one package with its own range; a SUM bundle adds the lowest and the highest prices of its
 * lines, each line priced as part of the bundle. `staff` are the staff the page offers, so
 * the ranges cover only them. No dates: prices without surcharges.
 *
 * With a context (catalogFloor, docs/pricing-stage4-api.md) the ranges include the promotions
 * every online client gets without a code; a promotion may be limited to staff, so each staff
 * member then has a range of their own.
 *
 * `listDate` is the day of the catalog (list) prices: the visit date when the setup is for
 * a visit, the location today by default.
 */
export function buildBookingSetupPrices(
  book: PriceBook,
  catalog: Pick<BookingServiceCatalog, 'services' | 'bundles'>,
  staff: readonly BookingStaff[],
  dates: readonly string[],
  context: QuoteContext | null = null,
  listDate: string = book.today,
): BookingSetupPrices {
  const performers = performersByService(staff);

  const catalogPrice = new Map(
    catalog.services.map((service) => [
      service.id,
      MoneyUtils.toMinor(service.price),
    ]),
  );

  // Surcharges of a line depend on the service, the bundle and the staff price only, so
  // staff members with the same price share one range.
  const lineRanges = new Map<string, PriceRange>();
  const lineRange = (
    bundleId: string | null,
    serviceId: string,
    staffId: string | null,
  ): PriceRange => {
    if (!book.hasService(serviceId)) {
      const price = catalogPrice.get(serviceId) ?? 0;
      return { min: price, max: price };
    }
    const key = `${bundleId ?? ''}:${serviceId}:${context ? (staffId ?? '') : book.staffPriceKey(serviceId, staffId, dates)}`;
    let range = lineRanges.get(key);
    if (!range) {
      range = book.priceRange(
        {
          bundleId,
          lines: [{ serviceId, staffId, customPrice: null }],
          context,
        },
        dates,
      );
      lineRanges.set(key, range);
    }
    return range;
  };
  const performedRange = (
    bundleId: string | null,
    serviceId: string,
  ): PriceRange => {
    const ranges = (performers.get(serviceId) ?? []).map((staffId) =>
      lineRange(bundleId, serviceId, staffId),
    );
    if (!ranges.length) return lineRange(bundleId, serviceId, null);
    return {
      min: Math.min(...ranges.map((range) => range.min)),
      max: Math.max(...ranges.map((range) => range.max)),
    };
  };
  const toDecimalRange = ({ min, max }: PriceRange): BookingPriceRange => ({
    priceFrom: MoneyUtils.fromMinor(min),
    priceTo: MoneyUtils.fromMinor(max),
  });

  const services = new Map(
    catalog.services.map((service) => [
      service.id,
      {
        ...toDecimalRange(performedRange(null, service.id)),
        listPrice: MoneyUtils.fromMinor(
          book.hasService(service.id)
            ? book.basePriceAt(service.id, listDate)
            : (catalogPrice.get(service.id) ?? 0),
        ),
      },
    ]),
  );
  const bundles = new Map(
    catalog.bundles.map((bundle) => {
      const priced = book.bundle(bundle.id) !== undefined;
      const serviceIds = bundle.items.map((item) => item.serviceId);
      const fixed =
        bundle.pricingMode === PrismaBundlePricingMode.FIXED &&
        bundle.fixedPrice !== null;
      let range: PriceRange;
      if (
        fixed &&
        priced &&
        serviceIds.every((serviceId) => book.hasService(serviceId))
      )
        range = book.priceRange(
          {
            bundleId: bundle.id,
            lines: serviceIds.map((serviceId) => ({
              serviceId,
              staffId: null,
              customPrice: null,
            })),
            context,
          },
          dates,
        );
      else if (fixed) {
        const price = MoneyUtils.toMinor(bundle.fixedPrice!);
        range = { min: price, max: price };
      } else
        range = serviceIds.reduce(
          (sum, serviceId) => {
            const item = performedRange(priced ? bundle.id : null, serviceId);
            return { min: sum.min + item.min, max: sum.max + item.max };
          },
          { min: 0, max: 0 },
        );
      // Catalog price today: the package price, or the sum of the service prices of today.
      const listPrice =
        priced && serviceIds.every((serviceId) => book.hasService(serviceId))
          ? (book.fixedPriceAt(bundle.id, listDate) ??
            serviceIds.reduce(
              (sum, serviceId) => sum + book.basePriceAt(serviceId, listDate),
              0,
            ))
          : null;
      return [
        bundle.id,
        {
          ...toDecimalRange(range),
          ...(listPrice === null
            ? {}
            : { listPrice: MoneyUtils.fromMinor(listPrice) }),
        },
      ] as const;
    }),
  );
  const staffServicePrices = new Map(
    staff.map((member): [string, BookingStaffServicePrice[]] => [
      member.id,
      member.staffServices
        .filter(({ serviceId }) => book.hasService(serviceId))
        .map(({ serviceId }) => ({
          serviceId,
          ...toDecimalRange(lineRange(null, serviceId, member.id)),
        })),
    ]),
  );
  return { services, bundles, staffServicePrices };
}

/**
 * Price-list ranges of the cabinet catalog (docs/pricing-stage7-api.md): what the staff
 * charge by the price list on `listDate`, with no surcharges and no promotions. A service
 * costs from the lowest to the highest list price among the staff who perform it (personal
 * price, else level price, else base price - PriceBook.staffPrice); a service nobody
 * performs costs its base price. A FIXED bundle costs its package price; a SUM bundle adds
 * the lowest and the highest list prices of its lines, whatever its execution mode.
 */
export function buildCatalogListPrices(
  book: PriceBook,
  catalog: Pick<BookingServiceCatalog, 'services' | 'bundles'>,
  staff: readonly BookingStaff[],
  listDate: string = book.today,
): CatalogListPrices {
  const performers = performersByService(staff);
  const catalogPrice = new Map(
    catalog.services.map((service) => [
      service.id,
      MoneyUtils.toMinor(service.price),
    ]),
  );
  const serviceRange = (serviceId: string): PriceRange => {
    if (!book.hasService(serviceId)) {
      const price = catalogPrice.get(serviceId) ?? 0;
      return { min: price, max: price };
    }
    const staffIds = performers.get(serviceId) ?? [];
    const prices = staffIds.length
      ? staffIds.map((staffId) => book.staffPrice(serviceId, staffId, listDate))
      : [book.basePriceAt(serviceId, listDate)];
    return { min: Math.min(...prices), max: Math.max(...prices) };
  };
  const services = new Map(
    catalog.services.map((service) => [service.id, serviceRange(service.id)]),
  );
  const bundles = new Map(
    catalog.bundles.map((bundle) => {
      const serviceIds = bundle.items.map((item) => item.serviceId);
      let range: PriceRange;
      if (
        bundle.pricingMode === PrismaBundlePricingMode.FIXED &&
        bundle.fixedPrice !== null
      ) {
        const price =
          (book.bundle(bundle.id) !== undefined
            ? book.fixedPriceAt(bundle.id, listDate)
            : null) ?? MoneyUtils.toMinor(bundle.fixedPrice);
        range = { min: price, max: price };
      } else
        range = serviceIds.reduce(
          (sum, serviceId) => {
            const item = serviceRange(serviceId);
            return { min: sum.min + item.min, max: sum.max + item.max };
          },
          { min: 0, max: 0 },
        );
      return [bundle.id, range] as const;
    }),
  );
  return { services, bundles };
}

/** Ids of the staff who perform each service, by service id. */
function performersByService(
  staff: readonly BookingStaff[],
): Map<string, string[]> {
  const performers = new Map<string, string[]>();
  for (const member of staff)
    for (const { serviceId } of member.staffServices) {
      const ids = performers.get(serviceId);
      if (ids) ids.push(member.id);
      else performers.set(serviceId, [member.id]);
    }
  return performers;
}
