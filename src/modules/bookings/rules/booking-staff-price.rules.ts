import { PriceBook } from '../../pricing/engine/price-book.js';

/**
 * What a staff member would charge for a selection, in minor units. The selection must be
 * covered by the book (PricingFacade.assertPriceable). A FIXED bundle costs the package price
 * whoever takes it.
 */
export function staffVisitPrice(
  book: PriceBook,
  bundleId: string | null,
  serviceIds: readonly string[],
  staffId: string,
): number {
  return book.quote({
    bundleId,
    lines: serviceIds.map((serviceId) => ({
      serviceId,
      staffId,
      customPrice: null,
    })),
  }).total;
}

/** What a staff member would charge for one line of a selection, the other lines unassigned. */
export function staffLinePrice(
  book: PriceBook,
  bundleId: string | null,
  serviceIds: readonly string[],
  lineIndex: number,
  staffId: string,
): number {
  return book.quote({
    bundleId,
    lines: serviceIds.map((serviceId, index) => ({
      serviceId,
      staffId: index === lineIndex ? staffId : null,
      customPrice: null,
    })),
  }).lines[lineIndex].total;
}
