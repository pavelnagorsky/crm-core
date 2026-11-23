import { BundlePricingMode as PrismaBundlePricingMode } from '@prisma/client';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingPriceRange } from '../interfaces/booking-price-range.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingSetupPrices } from '../interfaces/booking-setup-prices.interface.js';
import { BookingStaffServicePrice } from '../interfaces/booking-staff-service-price.interface.js';
import { BookingStaff } from '../../staff/interfaces/booking-staff.interface.js';

type Range = { from: number; to: number };

/**
 * Prices the booking page shows (docs/pricing-stage2-api.md): a service costs from the lowest
 * to the highest price among the staff who perform it, a staff member has a price per service.
 * A service nobody performs costs its base price. A FIXED bundle is one package with one
 * price; a SUM bundle adds the lowest and the highest prices of its services.
 * `staff` are the staff the page offers, so the range covers only them.
 */
export function buildBookingSetupPrices(
  book: PriceBook,
  catalog: Pick<BookingServiceCatalog, 'services' | 'bundles'>,
  staff: readonly BookingStaff[],
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
  const staffPrice = (serviceId: string, staffId: string | null): number =>
    book.hasService(serviceId)
      ? book.staffPrice(serviceId, staffId)
      : (catalogPrice.get(serviceId) ?? 0);

  const rangeCache = new Map<string, Range>();
  const rangeOf = (serviceId: string): Range => {
    let range = rangeCache.get(serviceId);
    if (!range) {
      const prices = (performers.get(serviceId) ?? []).map((staffId) =>
        staffPrice(serviceId, staffId),
      );
      const base = staffPrice(serviceId, null);
      range = prices.length
        ? { from: Math.min(...prices), to: Math.max(...prices) }
        : { from: base, to: base };
      rangeCache.set(serviceId, range);
    }
    return range;
  };
  const toDecimalRange = ({ from, to }: Range): BookingPriceRange => ({
    priceFrom: MoneyUtils.fromMinor(from),
    priceTo: MoneyUtils.fromMinor(to),
  });

  const services = new Map(
    catalog.services.map((service) => [
      service.id,
      toDecimalRange(rangeOf(service.id)),
    ]),
  );
  const bundles = new Map(
    catalog.bundles.map((bundle) => {
      const range: Range =
        bundle.pricingMode === PrismaBundlePricingMode.FIXED &&
        bundle.fixedPrice !== null
          ? {
              from: MoneyUtils.toMinor(bundle.fixedPrice),
              to: MoneyUtils.toMinor(bundle.fixedPrice),
            }
          : bundle.items.reduce(
              (sum, item) => {
                const itemRange = rangeOf(item.serviceId);
                return {
                  from: sum.from + itemRange.from,
                  to: sum.to + itemRange.to,
                };
              },
              { from: 0, to: 0 },
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
          price: MoneyUtils.fromMinor(staffPrice(serviceId, member.id)),
        })),
    ]),
  );
  return { services, bundles, staffServicePrices };
}
