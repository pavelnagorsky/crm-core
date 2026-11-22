import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { LineQuote } from '../interfaces/line-quote.interface.js';
import { PricingSnapshot } from '../interfaces/pricing-snapshot.interface.js';
import { QuoteRequest } from '../interfaces/quote-request.interface.js';
import { VisitQuote } from '../interfaces/visit-quote.interface.js';
import { BundleAllocationCalculator } from './bundle-allocation.calculator.js';

/**
 * Prices the service lines of a visit layer by layer (docs/pricing-plan.md 2.1, 5.2).
 * Pure: no clock, no database; the caller validates that the request matches the snapshot.
 */
export class ServicePriceCalculator {
  private constructor() {}

  static quote(snapshot: PricingSnapshot, request: QuoteRequest): VisitQuote {
    const basePrices = ServicePriceCalculator.basePrices(snapshot, request);
    const lines = request.lines.map((line, index): LineQuote => {
      const basePrice = basePrices[index];
      // Staff levels and personal prices (stage 2) change staffPrice; surcharges (stage 3)
      // change listPrice; the best discount (stage 4) sets discountTotal.
      const staffPrice = basePrice;
      const listPrice = staffPrice;
      const discountTotal = 0;
      const chargedPrice = listPrice - discountTotal;
      return {
        serviceId: line.serviceId,
        basePrice,
        staffPrice,
        listPrice,
        discountTotal,
        chargedPrice,
        customPrice: line.customPrice,
        total: line.customPrice ?? chargedPrice,
        adjustments: [],
      };
    });
    return {
      lines,
      listTotal: lines.reduce((sum, line) => sum + line.listPrice, 0),
      discountTotal: lines.reduce(
        (sum, line) =>
          line.customPrice === null ? sum + line.discountTotal : sum,
        0,
      ),
      total: lines.reduce((sum, line) => sum + line.total, 0),
    };
  }

  /**
   * Catalog price of each line. A FIXED bundle is one package: its lines share the bundle
   * price in proportion to their catalog prices, and the share is the line's base price.
   */
  private static basePrices(
    snapshot: PricingSnapshot,
    request: QuoteRequest,
  ): number[] {
    const services = new Map(
      snapshot.services.map((service) => [service.id, service]),
    );
    const catalogPrices = request.lines.map((line) => {
      const service = services.get(line.serviceId);
      if (!service) throw new Error(`Service ${line.serviceId} is not priced`);
      return service.price;
    });
    if (request.bundleId === null) return catalogPrices;

    const bundle = snapshot.bundles.find(({ id }) => id === request.bundleId);
    if (!bundle) throw new Error(`Bundle ${request.bundleId} is not priced`);
    if (bundle.pricingMode !== BundlePricingMode.FIXED) return catalogPrices;
    if (bundle.fixedPrice === null)
      throw new Error(`Fixed bundle ${bundle.id} has no price`);
    return BundleAllocationCalculator.allocate(
      bundle.fixedPrice,
      catalogPrices,
    );
  }
}
