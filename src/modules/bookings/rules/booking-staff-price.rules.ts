import { BundlePricingMode } from '../../pricing/engine/enums/bundle-pricing-mode.enum.js';
import { PriceRange } from '../../pricing/engine/interfaces/price-range.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { QuoteLineRequest } from '../../pricing/engine/interfaces/quote-line-request.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { BookingPriceWindow } from '../interfaces/booking-price-window.interface.js';

/**
 * What a staff member would charge for a selection, in minor units: exact at the visit start,
 * else the lowest and highest total over the window dates. The selection must be covered by
 * the book (PricingFacade.assertPriceable). A FIXED bundle costs the package price whoever
 * takes it. A context adds promotions and the client discount (docs/pricing-stage4-api.md).
 */
export function staffVisitPrice(
  book: PriceBook,
  bundleId: string | null,
  serviceIds: readonly string[],
  staffId: string,
  window: BookingPriceWindow,
  context: QuoteContext | null = null,
): PriceRange {
  const lines = serviceIds.map((serviceId): QuoteLineRequest => ({
    serviceId,
    staffId,
    customPrice: null,
  }));
  if (window.visit === null)
    return book.priceRange({ bundleId, lines, context }, window.dates);
  const { total } = book.quote({
    bundleId,
    lines,
    visit: window.visit,
    context,
  });
  return { min: total, max: total };
}

/**
 * What a staff member would charge for one line of a selection, the other lines unassigned:
 * exact at the visit start, else the range over the window dates.
 */
export function staffLinePrice(
  book: PriceBook,
  bundleId: string | null,
  serviceIds: readonly string[],
  lineIndex: number,
  staffId: string,
  window: BookingPriceWindow,
  context: QuoteContext | null = null,
): PriceRange {
  const lines = serviceIds.map((serviceId, index): QuoteLineRequest => ({
    serviceId,
    staffId: index === lineIndex ? staffId : null,
    customPrice: null,
  }));
  if (window.visit !== null) {
    const total = book.quote({ bundleId, lines, visit: window.visit, context })
      .lines[
      lineIndex
    ].total;
    return { min: total, max: total };
  }
  const fixed =
    bundleId !== null &&
    book.bundle(bundleId)?.pricingMode === BundlePricingMode.FIXED;
  // A separate service or a SUM bundle line is priced on its own; a FIXED bundle line is a
  // share of the package, so its range comes from the parts of each day.
  if (!fixed)
    return book.priceRange(
      { bundleId, lines: [lines[lineIndex]], context },
      window.dates,
    );
  if (window.dates.length === 0) {
    const total = book.quote({ bundleId, lines, visit: null, context }).lines[
      lineIndex
    ]
      .total;
    return { min: total, max: total };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const date of window.dates)
    for (const { quote } of book.daySegments(
      { bundleId, lines, context },
      date,
    )) {
      const total = quote.lines[lineIndex].total;
      min = Math.min(min, total);
      max = Math.max(max, total);
    }
  return { min, max };
}
