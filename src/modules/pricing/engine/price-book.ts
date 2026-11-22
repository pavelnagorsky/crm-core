import { BundleAllocationCalculator } from './calculators/bundle-allocation.calculator.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { LineQuote } from './interfaces/line-quote.interface.js';
import { PriceAdjustment } from './interfaces/price-adjustment.interface.js';
import { PricingBundleEntry } from './interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from './interfaces/pricing-level-entry.interface.js';
import { PricingServiceEntry } from './interfaces/pricing-service-entry.interface.js';
import { PricingSnapshot } from './interfaces/pricing-snapshot.interface.js';
import { PricingStaffEntry } from './interfaces/pricing-staff-entry.interface.js';
import { QuoteRequest } from './interfaces/quote-request.interface.js';
import { StaffPriceLayer } from './interfaces/staff-price-layer.interface.js';
import { VisitQuote } from './interfaces/visit-quote.interface.js';

/**
 * Prices of one location, indexed once (docs/pricing-plan.md 2.1, 2.2, 5.2). Pure: no clock,
 * no database. Build one per request and reuse it for every slot. The caller validates that
 * requests match the snapshot (PricingFacade).
 */
export class PriceBook {
  private readonly services: Map<string, PricingServiceEntry>;
  private readonly bundles: Map<string, PricingBundleEntry>;
  private readonly levels: Map<string, PricingLevelEntry>;
  private readonly staff: Map<string, PricingStaffEntry>;

  constructor(snapshot: PricingSnapshot) {
    this.services = new Map(snapshot.services.map((item) => [item.id, item]));
    this.bundles = new Map(snapshot.bundles.map((item) => [item.id, item]));
    this.levels = new Map(snapshot.levels.map((item) => [item.id, item]));
    this.staff = new Map(snapshot.staff.map((item) => [item.id, item]));
  }

  hasService(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  bundle(bundleId: string): PricingBundleEntry | undefined {
    return this.bundles.get(bundleId);
  }

  /**
   * Price of a separate service with this staff member: personal price ?? level price ??
   * base price. No staff member (not chosen yet) costs the base price.
   */
  staffPrice(serviceId: string, staffId: string | null): number {
    return this.staffLayer(serviceId, staffId).price;
  }

  /**
   * Price a staff member gives a line, for ranking "any staff" candidates. A FIXED bundle
   * is one package: every staff member costs the same, so the price is 0 for all.
   */
  candidatePrice(
    serviceId: string,
    staffId: string,
    bundleId: string | null,
  ): number {
    return this.isFixedBundle(bundleId)
      ? 0
      : this.staffPrice(serviceId, staffId);
  }

  quote(request: QuoteRequest): VisitQuote {
    const basePrices = this.basePrices(request);
    const fixedBundle = this.isFixedBundle(request.bundleId);
    const lines = request.lines.map((line, index): LineQuote => {
      const basePrice = basePrices[index];
      const layer: StaffPriceLayer = fixedBundle
        ? { price: basePrice, adjustment: null }
        : this.staffLayer(line.serviceId, line.staffId);
      const staffPrice = layer.price;
      // Surcharges (stage 3) change listPrice; the best discount (stage 4) sets discountTotal.
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
        adjustments: layer.adjustment ? [layer.adjustment] : [],
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

  /** Staff price of a separate service and the layer that explains it, if any. */
  private staffLayer(
    serviceId: string,
    staffId: string | null,
  ): StaffPriceLayer {
    const service = this.requireService(serviceId);
    const staff = staffId === null ? undefined : this.staff.get(staffId);
    if (!staff) return { price: service.price, adjustment: null };
    const personal = staff.servicePrices[serviceId];
    if (personal !== undefined)
      return this.layer(
        PriceAdjustmentKind.STAFF,
        staff.name,
        personal,
        service.price,
      );
    const level = staff.levelId ? this.levels.get(staff.levelId) : undefined;
    const levelPrice = level ? service.levelPrices[level.id] : undefined;
    if (level && levelPrice !== undefined)
      return this.layer(
        PriceAdjustmentKind.LEVEL,
        level.name,
        levelPrice,
        service.price,
      );
    return { price: service.price, adjustment: null };
  }

  private layer(
    kind: PriceAdjustmentKind,
    title: string,
    price: number,
    basePrice: number,
  ): StaffPriceLayer {
    if (price === basePrice) return { price, adjustment: null };
    const adjustment: PriceAdjustment = {
      kind,
      ruleId: null,
      title,
      publicTitle: null,
      valueType: null,
      value: null,
      amount: price - basePrice,
    };
    return { price, adjustment };
  }

  private isFixedBundle(bundleId: string | null): boolean {
    return (
      bundleId !== null &&
      this.bundles.get(bundleId)?.pricingMode === BundlePricingMode.FIXED
    );
  }

  /**
   * Catalog price of each line. A FIXED bundle is one package: its lines share the bundle
   * price in proportion to their catalog prices, and the share is the base price of a line.
   */
  private basePrices(request: QuoteRequest): number[] {
    const catalogPrices = request.lines.map(
      (line) => this.requireService(line.serviceId).price,
    );
    if (request.bundleId === null) return catalogPrices;
    const bundle = this.bundles.get(request.bundleId);
    if (!bundle) throw new Error(`Bundle ${request.bundleId} is not priced`);
    if (bundle.pricingMode !== BundlePricingMode.FIXED) return catalogPrices;
    if (bundle.fixedPrice === null)
      throw new Error(`Fixed bundle ${bundle.id} has no price`);
    return BundleAllocationCalculator.allocate(
      bundle.fixedPrice,
      catalogPrices,
    );
  }

  private requireService(serviceId: string): PricingServiceEntry {
    const service = this.services.get(serviceId);
    if (!service) throw new Error(`Service ${serviceId} is not priced`);
    return service;
  }
}
