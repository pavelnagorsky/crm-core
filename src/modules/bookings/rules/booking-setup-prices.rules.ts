import { BundlePricingMode as PrismaBundlePricingMode } from '@prisma/client';
import { PriceRange } from '../../pricing/engine/interfaces/price-range.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingPriceRange } from '../interfaces/booking-price-range.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingSetupPrices } from '../interfaces/booking-setup-prices.interface.js';
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
 */
export function buildBookingSetupPrices(
  book: PriceBook,
  catalog: Pick<BookingServiceCatalog, 'services' | 'bundles'>,
  staff: readonly BookingStaff[],
  dates: readonly string[],
  context: QuoteContext | null = null,
): BookingSetupPrices {
  const performers = new Map<string, string[]>();
  for (const member of staff)
    for (const { serviceId } of member.staffServices) {
      const ids = performers.get(serviceId);
      if (ids) ids.push(member.id);
      else performers.set(serviceId, [member.id]);
    }

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
    const key = `${bundleId ?? ''}:${serviceId}:${context ? (staffId ?? '') : book.staffPrice(serviceId, staffId)}`;
    let range = lineRanges.get(key);
    if (!range) {
      range = book.priceRange(
        { bundleId, lines: [{ serviceId, staffId, customPrice: null }], context },
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
      toDecimalRange(performedRange(null, service.id)),
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
      return [bundle.id, toDecimalRange(range)] as const;
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
