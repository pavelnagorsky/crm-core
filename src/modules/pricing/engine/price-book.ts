import { BundleAllocationCalculator } from './calculators/bundle-allocation.calculator.js';
import { RoundingCalculator } from './calculators/rounding.calculator.js';
import { CompiledRule } from './compile/compiled-rule.js';
import { CompiledRuleSet } from './compile/compiled-rule-set.js';
import { RuleTargetContext } from './compile/interfaces/rule-target-context.interface.js';
import { RuleCompiler } from './compile/rule-compiler.js';
import {
  productTargetContext,
  serviceTargetContext,
} from './compile/rule-target-contexts.js';
import {
  CLIENT_DISCOUNT_PUBLIC_TITLE,
  CLIENT_DISCOUNT_TITLE,
} from './constants/discount-titles.constants.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { DiscountChoiceMode } from './enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import {
  PriceTimeline,
  baseKey,
  bundleKey,
  levelKey,
  productKey,
  staffKey,
} from './price-timeline.js';
import { PriceRuleKind } from './enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from './enums/price-rule-skip-reason.enum.js';
import { PriceValueType } from './enums/price-value-type.enum.js';
import { ProductUnit } from './enums/product-unit.enum.js';
import { PromoCodeStatus } from './enums/promo-code-status.enum.js';
import { RoundingMode } from './enums/rounding-mode.enum.js';
import { DaySegment } from './interfaces/day-segment.interface.js';
import { DiscountCandidate } from './interfaces/discount-candidate.interface.js';
import { LineDiscountChoice } from './interfaces/line-discount-choice.interface.js';
import { LineDiscountOptions } from './interfaces/line-discount-options.interface.js';
import { LineDiscount } from './interfaces/line-discount.interface.js';
import { LineQuote } from './interfaces/line-quote.interface.js';
import { ListedLine } from './interfaces/listed-line.interface.js';
import { PriceAdjustment } from './interfaces/price-adjustment.interface.js';
import { PriceRange } from './interfaces/price-range.interface.js';
import { PriceRuleNotApplied } from './interfaces/price-rule-not-applied.interface.js';
import { PriceScope } from './interfaces/price-scope.interface.js';
import { ProductExplanation } from './interfaces/product-explanation.interface.js';
import { ProductLineQuote } from './interfaces/product-line-quote.interface.js';
import { ProductQuoteLineRequest } from './interfaces/product-quote-line-request.interface.js';
import { ProductQuoteRequest } from './interfaces/product-quote-request.interface.js';
import { ProductsQuote } from './interfaces/products-quote.interface.js';
import { PricingBundleEntry } from './interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from './interfaces/pricing-level-entry.interface.js';
import { PricingProductEntry } from './interfaces/pricing-product-entry.interface.js';
import { PricingServiceEntry } from './interfaces/pricing-service-entry.interface.js';
import { PricingSnapshot } from './interfaces/pricing-snapshot.interface.js';
import { PricingStaffEntry } from './interfaces/pricing-staff-entry.interface.js';
import { PromoCodeResult } from './interfaces/promo-code-result.interface.js';
import { PromotionSkip } from './interfaces/promotion-skip.interface.js';
import { QuoteContext } from './interfaces/quote-context.interface.js';
import { QuoteExplanation } from './interfaces/quote-explanation.interface.js';
import { QuoteLineRequest } from './interfaces/quote-line-request.interface.js';
import { QuoteRequest } from './interfaces/quote-request.interface.js';
import { StaffPriceLayer } from './interfaces/staff-price-layer.interface.js';
import { VisitQuote } from './interfaces/visit-quote.interface.js';
import { VisitTime } from './interfaces/visit-time.interface.js';

const MINUTES_PER_DAY = 1440;
const ROUNDING_TITLE = 'Округление';
const FULL_PERCENT_BP = 10000;
const MILLI = 1000;

/**
 * Prices of one location, indexed once (docs/pricing-plan.md 2.1, 2.2, 2.5, 3.2, 5.2). Pure:
 * no clock, no database. Build one per request and reuse it for every slot. The caller
 * validates that requests match the snapshot (PricingFacade).
 *
 * Discounts (docs/pricing-stage4-api.md) need a quote context: candidates are the promotions
 * whose schedule, targets and conditions hold, plus the client discount; the biggest discount
 * in money wins (on a tie the client discount, then the earlier promotion). The discounted
 * price is rounded down to the location step, never below 0.
 *
 * Scheduled price changes (docs/pricing-stage6-api.md) are read by date: a visit is priced
 * with the catalog prices of its local date, "today" (the location day, given by the
 * caller) when there is no visit.
 *
 * Product lines (docs/pricing-stage7-api.md) get the retail price of their date, then one best
 * discount on the line total (promotions with product targets, or the client discount on
 * products), then a custom price. Surcharges, levels and personal prices never reach them.
 */
export class PriceBook {
  private readonly services: Map<string, PricingServiceEntry>;
  private readonly bundles: Map<string, PricingBundleEntry>;
  private readonly levels: Map<string, PricingLevelEntry>;
  private readonly staff: Map<string, PricingStaffEntry>;
  private readonly products: Map<string, PricingProductEntry>;
  private readonly rules: CompiledRuleSet;
  private readonly promotions: CompiledRuleSet;
  private readonly roundingStep: number;
  private readonly timeline: PriceTimeline;

  /** `today` is the location's local date (YYYY-MM-DD); the engine has no clock. */
  constructor(
    snapshot: PricingSnapshot,
    readonly today: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today))
      throw new RangeError(`Invalid today ${today}`);
    this.timeline = new PriceTimeline(snapshot.priceChanges);
    this.services = new Map(snapshot.services.map((item) => [item.id, item]));
    this.bundles = new Map(snapshot.bundles.map((item) => [item.id, item]));
    this.levels = new Map(snapshot.levels.map((item) => [item.id, item]));
    this.staff = new Map(snapshot.staff.map((item) => [item.id, item]));
    this.products = new Map(
      snapshot.products.map((item) => [item.productLocationId, item]),
    );
    this.rules = RuleCompiler.compile(
      snapshot.rules.filter((rule) => rule.kind === PriceRuleKind.SURCHARGE),
    );
    this.promotions = RuleCompiler.compile(
      snapshot.rules.filter((rule) => rule.kind === PriceRuleKind.PROMOTION),
    );
    if (
      !Number.isSafeInteger(snapshot.roundingStep) ||
      snapshot.roundingStep < 1
    )
      throw new RangeError(`Invalid rounding step ${snapshot.roundingStep}`);
    this.roundingStep = snapshot.roundingStep;
  }

  hasService(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  bundle(bundleId: string): PricingBundleEntry | undefined {
    return this.bundles.get(bundleId);
  }

  /** The location sells this product (retail price set, for sale). */
  hasProduct(productLocationId: string): boolean {
    return this.products.has(productLocationId);
  }

  product(productLocationId: string): PricingProductEntry | undefined {
    return this.products.get(productLocationId);
  }

  /** Retail price of a product on a local date (scheduled changes included), minor units. */
  productPriceAt(productLocationId: string, date: string): number {
    const product = this.requireProduct(productLocationId);
    return (
      this.timeline.resolve(
        productKey(productLocationId),
        date,
        product.retailPrice,
      ) ?? product.retailPrice
    );
  }

  /**
   * Product lines of one visit order or sale (docs/pricing-stage7-api.md). Each line: the
   * retail price of time.date, the list line total (quantity x price, half up), one best
   * discount on the line (rounded down to the location step, never below 0), or a custom
   * price without candidates. A promotion minimum compares otherListTotal plus every line
   * list total of the request.
   */
  quoteProducts(request: ProductQuoteRequest): ProductsQuote {
    const visitListTotal =
      request.otherListTotal +
      request.lines.reduce(
        (sum, line) => sum + this.listLineTotal(line, request.time.date),
        0,
      );
    const lines = request.lines.map((line, index) =>
      this.productLine(line, index, request, visitListTotal),
    );
    const quote: ProductsQuote = {
      lines,
      listTotal: lines.reduce((sum, line) => sum + line.listLineTotal, 0),
      discountTotal: lines.reduce((sum, line) => sum + line.discountTotal, 0),
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      promoCode: null,
    };
    quote.promoCode = this.productPromoCodeResult(request, quote);
    return quote;
  }

  /**
   * One product line and every promotion that did not reach it, with the first failed check
   * (schedule, targets, own conditions; LESS_BENEFICIAL when it holds but lost). Surcharges
   * never reach products and are not listed. Without a context nothing is explained.
   */
  explainProduct(
    line: ProductQuoteLineRequest,
    time: VisitTime,
    context: QuoteContext | null,
    otherListTotal: number,
  ): ProductExplanation {
    const request: ProductQuoteRequest = {
      lines: [line],
      time,
      context,
      otherListTotal,
    };
    const quote = this.quoteProducts(request);
    if (context === null) return { quote, notApplied: [] };
    const quoted = quote.lines[0];
    const eligible = new Set(
      quoted.eligible
        .map((candidate) => candidate.ruleId)
        .filter((id): id is string => id !== null),
    );
    const notApplied: PriceRuleNotApplied[] = [];
    for (const rule of this.promotions.rules) {
      if (quoted.discount?.ruleId === rule.id) continue;
      const reason = eligible.has(rule.id)
        ? PriceRuleSkipReason.LESS_BENEFICIAL
        : (this.productPromotionReason(rule, request, quote) ??
          PriceRuleSkipReason.LESS_BENEFICIAL);
      notApplied.push({
        ruleId: rule.id,
        kind: PriceRuleKind.PROMOTION,
        name: rule.name,
        reason,
      });
    }
    return { quote, notApplied };
  }

  /** Promotions that are not archived (enabled or not), in display order. */
  promotionRules(): readonly CompiledRule[] {
    return this.promotions.rules;
  }

  /**
   * Price of a separate service with this staff member: personal price ?? level price ??
   * base price. No staff member (not chosen yet) costs the base price.
   */
  staffPrice(
    serviceId: string,
    staffId: string | null,
    date: string = this.today,
  ): number {
    return this.staffLayer(serviceId, staffId, date).price;
  }

  /** Catalog base price of a service on a local date (scheduled changes included). */
  basePriceAt(serviceId: string, date: string): number {
    const service = this.requireService(serviceId);
    return (
      this.timeline.resolve(baseKey(serviceId), date, service.price) ??
      service.price
    );
  }

  /** Price of a FIXED bundle on a local date; null for a SUM bundle (no price of its own). */
  fixedPriceAt(bundleId: string, date: string): number | null {
    const bundle = this.requireBundle(bundleId);
    if (bundle.pricingMode !== BundlePricingMode.FIXED) return null;
    return this.timeline.resolve(bundleKey(bundleId), date, bundle.fixedPrice);
  }

  /**
   * Cache key of the staff price over these dates: the price on the first date and on every
   * date a change reaches inside them, joined by ",". Staff members with the same price
   * in the whole window share a key.
   */
  staffPriceKey(
    serviceId: string,
    staffId: string | null,
    dates: readonly string[],
  ): string {
    if (dates.length === 0) return String(this.staffPrice(serviceId, staffId));
    const sorted = [...dates].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const staff = staffId === null ? undefined : this.staff.get(staffId);
    const keys = [baseKey(serviceId)];
    if (staff) {
      keys.push(staffKey(serviceId, staff.id));
      if (staff.levelId) keys.push(levelKey(serviceId, staff.levelId));
    }
    const starts = new Set<string>([first]);
    for (const key of keys)
      for (const date of this.timeline.changeDates(key, first, last))
        starts.add(date);
    return [...starts]
      .sort()
      .map((date) => this.staffPrice(serviceId, staffId, date))
      .join(',');
  }

  /**
   * Price a staff member gives a line, for ranking "any staff" candidates. A FIXED bundle
   * is one package: every staff member costs the same, so the price is 0 for all.
   * Without a context surcharges are left out on purpose: they depend only on the visit
   * start and the service, so the same rules reach every candidate at a given time, and
   * ranking by staff price stays correct. With a context and a visit, a discount may depend
   * on the staff member (promotions limited to staff), so the line is priced alone at that
   * start and its discounted price is returned; a promotion minimum then sees the line alone.
   */
  candidatePrice(
    serviceId: string,
    staffId: string,
    bundleId: string | null,
    visit: VisitTime | null = null,
    context: QuoteContext | null = null,
  ): number {
    if (this.isFixedBundle(bundleId)) return 0;
    if (context === null || visit === null)
      return this.staffPrice(serviceId, staffId, visit?.date ?? this.today);
    return this.quote({
      bundleId,
      lines: [{ serviceId, staffId, customPrice: null }],
      visit,
      context: { ...context, choice: undefined },
    }).lines[0].chargedPrice;
  }

  /** Price layers of a visit: staff price, surcharges by the visit start, rounding, discount. */
  quote(request: QuoteRequest): VisitQuote {
    return this.price(request, this.activeRules(request));
  }

  /**
   * The quote and every rule that did not reach it, with the first failed check in the
   * order of PriceRuleSkipReason. Promotions are listed only with a context; one that
   * applies to a line but lost to a bigger discount is LESS_BENEFICIAL. No visit time:
   * nothing to explain, notApplied is empty.
   */
  explain(request: QuoteRequest): QuoteExplanation {
    const active = this.activeRules(request);
    const quote = this.price(request, active);
    const visit = request.visit;
    if (visit === null) return { quote, notApplied: [] };

    const contexts = this.targetContexts(request);
    const applied = new Set<string>();
    for (const context of contexts)
      for (const rule of this.applicable(active, context)) applied.add(rule.id);

    const { day } = this.rules.onDate(visit.date);
    const notApplied: PriceRuleNotApplied[] = [];
    for (const rule of this.rules.rules) {
      if (applied.has(rule.id)) continue;
      const reason =
        rule.timeReason(day, visit.minute) ??
        this.targetReason(rule, contexts) ??
        PriceRuleSkipReason.OVERRIDDEN_BY_HOLIDAY;
      notApplied.push({
        ruleId: rule.id,
        kind: PriceRuleKind.SURCHARGE,
        name: rule.name,
        reason,
      });
    }

    const context = request.context ?? null;
    if (context === null) return { quote, notApplied };
    const discounted = new Set<string>();
    const eligible = new Set<string>();
    for (const line of quote.lines) {
      if (line.discount?.ruleId) discounted.add(line.discount.ruleId);
      for (const candidate of line.eligible)
        if (candidate.ruleId !== null) eligible.add(candidate.ruleId);
    }
    for (const rule of this.promotions.rules) {
      if (discounted.has(rule.id)) continue;
      // A promotion that holds but reached no line lost to another discount or a custom price.
      const reason = eligible.has(rule.id)
        ? PriceRuleSkipReason.LESS_BENEFICIAL
        : (this.promotionReason(rule, request, quote, visit, context) ??
          PriceRuleSkipReason.LESS_BENEFICIAL);
      notApplied.push({
        ruleId: rule.id,
        kind: PriceRuleKind.PROMOTION,
        name: rule.name,
        reason,
      });
    }
    return { quote, notApplied };
  }

  /**
   * Lowest and highest visit total over these local dates, for "from - to" prices. On each
   * date the day is cut at the interval edges of the rules that reach the scope there
   * (surcharges, and promotions when the scope has a context), and a visit starting at
   * each cut is priced. Shifts and busy time are not considered; the visit start in UTC is
   * not known, so lead time conditions do not hold. No dates: the price without rules.
   */
  priceRange(scope: PriceScope, dates: readonly string[]): PriceRange {
    const request = this.scopeRequest(scope);
    const todayFlat = this.price(request, [], this.today).total;
    const relevant = this.relevantRules(request);
    // Without scheduled changes the price without rules is the same on every date.
    const flatCache = new Map<string, number>();
    const flatOn = (date: string): number => {
      if (this.timeline.isEmpty) return todayFlat;
      let value = flatCache.get(date);
      if (value === undefined) {
        value = this.price(request, [], date).total;
        flatCache.set(date, value);
      }
      return value;
    };
    if (dates.length === 0) return { min: todayFlat, max: todayFlat };
    if (relevant.size === 0 && this.timeline.isEmpty)
      return { min: todayFlat, max: todayFlat };

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const date of dates) {
      const { surcharges, edges } = this.dayRules(date, relevant);
      if (edges.length === 0) {
        const flat = flatOn(date);
        min = Math.min(min, flat);
        max = Math.max(max, flat);
        continue;
      }
      for (const start of this.segmentStarts(edges)) {
        const { total } = this.price(
          { ...request, visit: { date, minute: start } },
          this.coveringAt(surcharges, start),
        );
        min = Math.min(min, total);
        max = Math.max(max, total);
      }
    }
    return { min, max };
  }

  /**
   * Parts of a local day (0-1440) where a visit of this scope costs the same, for the week
   * map. Adjacent parts with equal line layers are merged.
   */
  daySegments(scope: PriceScope, date: string): DaySegment[] {
    const request = this.scopeRequest(scope);
    const relevant = this.relevantRules(request);
    const { surcharges, edges } = this.dayRules(date, relevant);
    const starts = this.segmentStarts(edges);
    const withVisit = request.context !== null;

    const segments: DaySegment[] = [];
    let previousKey = '';
    starts.forEach((startMinute, index) => {
      const endMinute = starts[index + 1] ?? MINUTES_PER_DAY;
      const quote = this.price(
        withVisit
          ? { ...request, visit: { date, minute: startMinute } }
          : request,
        this.coveringAt(surcharges, startMinute),
        date,
      );
      const key = JSON.stringify(
        quote.lines.map((line) => [
          line.listPrice,
          line.total,
          line.adjustments,
        ]),
      );
      const last = segments[segments.length - 1];
      if (last && key === previousKey) last.endMinute = endMinute;
      else segments.push({ startMinute, endMinute, quote });
      previousKey = key;
    });
    return segments;
  }

  /** A scope as a request without a visit; its context does not know the visit start. */
  private scopeRequest(scope: PriceScope): QuoteRequest {
    const context = scope.context ?? null;
    return {
      ...scope,
      visit: null,
      context: context === null ? null : { ...context, visitStartMs: null },
    };
  }

  /** Relevant surcharges of a date, and every relevant rule whose edges cut that day. */
  private dayRules(
    date: string,
    relevant: ReadonlySet<CompiledRule>,
  ): { surcharges: CompiledRule[]; edges: CompiledRule[] } {
    const surcharges = this.rules
      .onDate(date)
      .rules.filter((rule) => relevant.has(rule));
    const promotions = this.promotions
      .onDate(date)
      .rules.filter((rule) => relevant.has(rule));
    return { surcharges, edges: [...surcharges, ...promotions] };
  }

  private activeRules(request: QuoteRequest): CompiledRule[] {
    return request.visit === null ? [] : this.rules.activeAt(request.visit);
  }

  /** Prices a request with the catalog prices of `date` (default: the visit date or today). */
  private price(
    request: QuoteRequest,
    active: readonly CompiledRule[],
    date: string = request.visit?.date ?? this.today,
  ): VisitQuote {
    if (request.bundleId !== null) this.requireBundle(request.bundleId);
    const lines = this.isFixedBundle(request.bundleId)
      ? this.fixedBundleLines(request, active, date)
      : this.separateLines(request, active, date);
    const quote: VisitQuote = {
      lines,
      listTotal: lines.reduce((sum, line) => sum + line.listPrice, 0),
      discountTotal: lines.reduce(
        (sum, line) =>
          line.customPrice === null ? sum + line.discountTotal : sum,
        0,
      ),
      total: lines.reduce((sum, line) => sum + line.total, 0),
      promoCode: null,
    };
    quote.promoCode = this.promoCodeResult(request, quote);
    return quote;
  }

  /** Separate services or a SUM bundle: each line with its own layers and discount. */
  private separateLines(
    request: QuoteRequest,
    active: readonly CompiledRule[],
    date: string,
  ): LineQuote[] {
    const listed = request.lines.map((line) =>
      this.separateLine(line, request.bundleId, active, date),
    );
    const context = request.context ?? null;
    const visitListTotal = listed.reduce(
      (sum, item) => sum + item.listPrice,
      0,
    );
    return listed.map((item, index) => {
      if (context === null || item.line.customPrice !== null)
        return this.lineQuote(item, null, { eligible: [], ineligible: [] });
      const service = this.requireService(item.line.serviceId);
      const options = this.lineDiscounts(
        serviceTargetContext(service.id, service.categoryId, request.bundleId),
        [item.line.staffId],
        item.listPrice,
        visitListTotal,
        request.visit,
        context,
        context.client.servicesDiscountBp,
        (value, listPrice) => listPrice - value,
      );
      const chosen = this.choose(options.eligible, context.choice?.[index]);
      return this.lineQuote(
        item,
        chosen === null ? null : { candidate: chosen, amount: chosen.amount },
        options,
      );
    });
  }

  /** A separate service or a SUM bundle line up to its list price. */
  private separateLine(
    line: QuoteLineRequest,
    bundleId: string | null,
    active: readonly CompiledRule[],
    date: string,
  ): ListedLine {
    const service = this.requireService(line.serviceId);
    const layer = this.staffLayer(line.serviceId, line.staffId, date);
    const surcharges = this.surcharges(
      active,
      serviceTargetContext(service.id, service.categoryId, bundleId),
      layer.price,
    );
    const raw = layer.price + this.sumOf(surcharges);
    const listPrice = this.listPrice(layer.price, raw);
    return {
      line,
      basePrice: this.basePriceAt(service.id, date),
      staffPrice: layer.price,
      listPrice,
      adjustments: [
        ...(layer.adjustment ? [layer.adjustment] : []),
        ...surcharges.filter((adjustment) => adjustment.amount !== 0),
        ...this.roundingAdjustments(listPrice - raw),
      ],
    };
  }

  /**
   * A FIXED bundle is one package: surcharges and rounding apply to the bundle price, then
   * every layer is split across the lines in proportion to their catalog prices
   * (BundleAllocationCalculator). The bundle price and each surcharge are allocated on
   * their own. Without rounding a line's list price is the sum of its shares; when
   * rounding moved the bundle price, line list prices are an allocation of the rounded
   * bundle price and a line's rounding share is what closes its gap. Either way each
   * line's layers add up to its list price and the lines add up to every bundle layer.
   * The discount is chosen for the package (its list price, BUNDLE targets or "all", the
   * staff of every line, the first choice given) and split in proportion to the line list
   * prices, so no share exceeds its line.
   */
  private fixedBundleLines(
    request: QuoteRequest,
    active: readonly CompiledRule[],
    date: string,
  ): LineQuote[] {
    const bundle = this.requireBundle(request.bundleId as string);
    const fixedPrice = this.fixedPriceAt(bundle.id, date);
    if (fixedPrice === null)
      throw new Error(`Fixed bundle ${bundle.id} has no price`);
    const weights = request.lines.map((line) =>
      this.basePriceAt(line.serviceId, date),
    );
    const basePrices = BundleAllocationCalculator.allocate(fixedPrice, weights);

    const surcharges = this.surcharges(
      active,
      serviceTargetContext(null, null, bundle.id),
      fixedPrice,
    );
    const raw = fixedPrice + this.sumOf(surcharges);
    const bundleList = this.listPrice(fixedPrice, raw);
    const surchargeShares = surcharges.map((adjustment) =>
      BundleAllocationCalculator.allocate(adjustment.amount, weights),
    );
    const listPrices =
      bundleList === raw
        ? basePrices.map(
            (basePrice, index) =>
              basePrice +
              surchargeShares.reduce((sum, shares) => sum + shares[index], 0),
          )
        : BundleAllocationCalculator.allocate(bundleList, weights);

    const listed: ListedLine[] = request.lines.map((line, index) => {
      const basePrice = basePrices[index];
      const lineSurcharges = surcharges
        .map((adjustment, k) => ({
          ...adjustment,
          amount: surchargeShares[k][index],
        }))
        .filter((adjustment) => adjustment.amount !== 0);
      const rounding =
        listPrices[index] - basePrice - this.sumOf(lineSurcharges);
      return {
        line,
        basePrice,
        staffPrice: basePrice,
        listPrice: listPrices[index],
        adjustments: [...lineSurcharges, ...this.roundingAdjustments(rounding)],
      };
    });

    const context = request.context ?? null;
    const none: LineDiscountOptions = { eligible: [], ineligible: [] };
    if (context === null)
      return listed.map((item) => this.lineQuote(item, null, none));
    const options = this.lineDiscounts(
      serviceTargetContext(null, null, bundle.id),
      request.lines.map((line) => line.staffId),
      bundleList,
      bundleList,
      request.visit,
      context,
      context.client.servicesDiscountBp,
      (value, listPrice) => listPrice - value,
    );
    const choice = request.lines
      .map((_, index) => context.choice?.[index])
      .find((item) => item !== undefined);
    const chosen = this.choose(options.eligible, choice);
    const shares =
      chosen === null || chosen.amount === 0
        ? null
        : BundleAllocationCalculator.allocate(chosen.amount, listPrices);
    return listed.map((item, index) =>
      this.lineQuote(
        item,
        chosen === null || shares === null
          ? null
          : { candidate: chosen, amount: shares[index] },
        options,
      ),
    );
  }

  private lineQuote(
    item: ListedLine,
    discount: LineDiscount | null,
    options: LineDiscountOptions,
  ): LineQuote {
    const { line, listPrice } = item;
    const custom = line.customPrice !== null;
    const applied =
      !custom && discount !== null && discount.amount > 0 ? discount : null;
    const adjustment: PriceAdjustment | null =
      applied === null
        ? null
        : {
            kind: applied.candidate.kind,
            ruleId: applied.candidate.ruleId,
            title: applied.candidate.title,
            publicTitle: applied.candidate.publicTitle,
            valueType: applied.candidate.valueType,
            value: applied.candidate.value,
            amount: -applied.amount,
          };
    const discountTotal = applied?.amount ?? 0;
    const chargedPrice = listPrice - discountTotal;
    return {
      serviceId: line.serviceId,
      basePrice: item.basePrice,
      staffPrice: item.staffPrice,
      listPrice,
      discountTotal,
      chargedPrice,
      customPrice: line.customPrice,
      total: line.customPrice ?? chargedPrice,
      adjustments:
        adjustment === null
          ? item.adjustments
          : [...item.adjustments, adjustment],
      discount: adjustment,
      eligible: custom ? [] : options.eligible,
      ineligible: custom ? [] : options.ineligible,
    };
  }

  /**
   * Discounts that apply to a line, best first, and the enabled promotions that target it
   * but do not apply. Promotions need a visit time; the client discount does not.
   * `amountPrice` gives the price after an AMOUNT discount (a service takes the value once,
   * a product line per piece or once per line).
   */
  private lineDiscounts(
    target: RuleTargetContext,
    staffIds: readonly (string | null)[],
    listPrice: number,
    visitListTotal: number,
    visit: VisitTime | null,
    context: QuoteContext,
    clientDiscountBp: number | null,
    amountPrice: (value: number, listPrice: number) => number,
    noVisit = false,
  ): LineDiscountOptions {
    const eligible: DiscountCandidate[] = [];
    const ineligible: PromotionSkip[] = [];
    const { client } = context;
    if (client.known && clientDiscountBp !== null && clientDiscountBp > 0)
      eligible.push(
        this.candidate(
          PriceAdjustmentKind.CLIENT_DISCOUNT,
          null,
          CLIENT_DISCOUNT_TITLE,
          CLIENT_DISCOUNT_PUBLIC_TITLE,
          PriceValueType.PERCENT,
          Math.min(clientDiscountBp, FULL_PERCENT_BP),
          listPrice,
          amountPrice,
        ),
      );
    if (visit !== null && !this.promotions.isEmpty) {
      const { day } = this.promotions.onDate(visit.date);
      const check = { context, day, staffIds, visitListTotal, noVisit };
      for (const rule of this.promotions.rules) {
        const promotion = rule.promotion;
        if (!rule.enabled || promotion === null) continue;
        if (rule.targetReason(target) !== null) continue;
        const reason =
          rule.timeReason(day, visit.minute) ??
          promotion.conditionReason(check);
        if (reason === null)
          eligible.push(
            this.candidate(
              PriceAdjustmentKind.PROMOTION,
              rule.id,
              rule.name,
              promotion.showAsPromotion ? promotion.publicName : null,
              rule.valueType,
              rule.value,
              listPrice,
              amountPrice,
            ),
          );
        else ineligible.push({ ruleId: rule.id, title: rule.name, reason });
      }
    }
    // Stable sort: on equal money the client discount (pushed first), then display order.
    eligible.sort((a, b) => b.amount - a.amount);
    return { eligible, ineligible };
  }

  private candidate(
    kind: DiscountCandidate['kind'],
    ruleId: string | null,
    title: string,
    publicTitle: string | null,
    valueType: PriceValueType,
    value: number,
    listPrice: number,
    amountPrice: (value: number, listPrice: number) => number,
  ): DiscountCandidate {
    const raw =
      valueType === PriceValueType.PERCENT
        ? listPrice - RoundingCalculator.percent(listPrice, value)
        : amountPrice(value, listPrice);
    const chargedPrice = Math.min(
      listPrice,
      RoundingCalculator.round(raw, this.roundingStep, RoundingMode.DOWN),
    );
    return {
      kind,
      ruleId,
      title,
      publicTitle,
      valueType,
      value,
      amount: listPrice - chargedPrice,
      chargedPrice,
    };
  }

  private choose(
    eligible: readonly DiscountCandidate[],
    choice: LineDiscountChoice | undefined,
  ): DiscountCandidate | null {
    const best = eligible[0] ?? null;
    // A stored choice whose discount no longer applies falls back to the best one.
    const missing = choice?.fallbackToAuto ? best : null;
    switch (choice?.mode ?? DiscountChoiceMode.AUTO) {
      case DiscountChoiceMode.NONE:
        return null;
      case DiscountChoiceMode.RULE:
        return (
          eligible.find(
            (candidate) =>
              candidate.kind === PriceAdjustmentKind.PROMOTION &&
              candidate.ruleId === choice?.ruleId,
          ) ?? missing
        );
      case DiscountChoiceMode.CLIENT_DISCOUNT:
        return (
          eligible.find(
            (candidate) =>
              candidate.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
          ) ?? missing
        );
      default:
        return best;
    }
  }

  /**
   * First reason a promotion does not reach a visit: schedule, then targets (EXCLUDED wins
   * over NOT_TARGETED), then its conditions on the first targeted line. Null: it holds
   * (the line may still carry a custom price).
   */
  private promotionReason(
    rule: CompiledRule,
    request: QuoteRequest,
    quote: VisitQuote,
    visit: VisitTime,
    context: QuoteContext,
  ): PriceRuleSkipReason | null {
    const { day } = this.promotions.onDate(visit.date);
    const timeReason = rule.timeReason(day, visit.minute);
    if (timeReason !== null) return timeReason;
    const contexts = this.targetContexts(request);
    const targetReason = this.targetReason(rule, contexts);
    if (targetReason !== null) return targetReason;
    const fixed = this.isFixedBundle(request.bundleId);
    const index = fixed
      ? 0
      : contexts.findIndex((target) => rule.targetReason(target) === null);
    return (
      rule.promotion?.conditionReason({
        context,
        day,
        staffIds: fixed
          ? request.lines.map((line) => line.staffId)
          : [request.lines[index].staffId],
        visitListTotal: quote.listTotal,
      }) ?? null
    );
  }

  private promoCodeResult(
    request: QuoteRequest,
    quote: VisitQuote,
  ): PromoCodeResult | null {
    const context = request.context ?? null;
    const code = context?.promoCode?.trim().toUpperCase() ?? '';
    if (context === null || code === '') return null;
    const rule = this.promotions.rules.find(
      (item) => item.promotion?.promoCode === code,
    );
    if (!rule)
      return {
        code,
        status: PromoCodeStatus.NOT_FOUND,
        ruleId: null,
        reason: null,
        minVisitTotal: null,
      };
    const result = (
      status: PromoCodeStatus,
      reason: PriceRuleSkipReason | null = null,
    ): PromoCodeResult => ({
      code,
      status,
      ruleId: rule.id,
      reason,
      minVisitTotal:
        reason === PriceRuleSkipReason.BELOW_MIN_TOTAL
          ? (rule.promotion?.minVisitTotal ?? null)
          : null,
    });
    if (quote.lines.some((line) => line.discount?.ruleId === rule.id))
      return result(PromoCodeStatus.APPLIED);
    if (
      quote.lines.some((line) =>
        line.eligible.some((candidate) => candidate.ruleId === rule.id),
      )
    )
      return result(PromoCodeStatus.BETTER_APPLIED);
    // No visit time yet: the schedule cannot hold.
    const reason =
      request.visit === null
        ? PriceRuleSkipReason.OUT_OF_INTERVAL
        : this.promotionReason(rule, request, quote, request.visit, context);
    return reason === null
      ? result(PromoCodeStatus.BETTER_APPLIED)
      : result(PromoCodeStatus.NOT_APPLICABLE, reason);
  }

  /**
   * Surcharges that reach a target, each from `price` (plan 2.5): all matching rules add
   * up; when an exclusive holiday rule matches, only exclusive holiday rules apply.
   */
  private surcharges(
    active: readonly CompiledRule[],
    context: RuleTargetContext,
    price: number,
  ): PriceAdjustment[] {
    return this.applicable(active, context).map((rule) => ({
      kind: PriceAdjustmentKind.SURCHARGE,
      ruleId: rule.id,
      title: rule.name,
      publicTitle: null,
      valueType: rule.valueType,
      value: rule.value,
      amount:
        rule.valueType === PriceValueType.PERCENT
          ? RoundingCalculator.percent(price, rule.value)
          : rule.value,
    }));
  }

  private applicable(
    active: readonly CompiledRule[],
    context: RuleTargetContext,
  ): CompiledRule[] {
    const matched = active.filter(
      (rule) => rule.targetReason(context) === null,
    );
    const exclusive = matched.filter((rule) => rule.holidayExclusive);
    return exclusive.length > 0 ? exclusive : matched;
  }

  /** Only a price a rule changed is rounded; never below 0. */
  private listPrice(staffPrice: number, raw: number): number {
    return raw === staffPrice
      ? staffPrice
      : RoundingCalculator.round(raw, this.roundingStep, RoundingMode.NEAREST);
  }

  private roundingAdjustments(amount: number): PriceAdjustment[] {
    if (amount === 0) return [];
    return [
      {
        kind: PriceAdjustmentKind.ROUNDING,
        ruleId: null,
        title: ROUNDING_TITLE,
        publicTitle: null,
        valueType: null,
        value: null,
        amount,
      },
    ];
  }

  private sumOf(adjustments: readonly PriceAdjustment[]): number {
    return adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
  }

  /** What rule targets are matched against: the package, or each line. */
  private targetContexts(request: QuoteRequest): RuleTargetContext[] {
    if (this.isFixedBundle(request.bundleId))
      return [serviceTargetContext(null, null, request.bundleId)];
    return request.lines.map((line) =>
      serviceTargetContext(
        line.serviceId,
        this.requireService(line.serviceId).categoryId,
        request.bundleId,
      ),
    );
  }

  /** quantity x unit price, half up to a minor unit. */
  private static lineAmount(quantityMilli: number, unitPrice: number): number {
    if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 0)
      throw new RangeError(`Invalid quantity ${quantityMilli}`);
    const product = quantityMilli * unitPrice;
    if (Number.isSafeInteger(product))
      return Math.floor((product + MILLI / 2) / MILLI);
    return Number(
      (BigInt(quantityMilli) * BigInt(unitPrice) + BigInt(MILLI / 2)) /
        BigInt(MILLI),
    );
  }

  private listLineTotal(line: ProductQuoteLineRequest, date: string): number {
    return PriceBook.lineAmount(
      line.quantityMilli,
      this.productPriceAt(line.productLocationId, date),
    );
  }

  private productContext(product: PricingProductEntry): RuleTargetContext {
    return productTargetContext(product.productId, product.categoryId);
  }

  private productLine(
    line: ProductQuoteLineRequest,
    index: number,
    request: ProductQuoteRequest,
    visitListTotal: number,
  ): ProductLineQuote {
    const product = this.requireProduct(line.productLocationId);
    const listUnitPrice = this.productPriceAt(
      line.productLocationId,
      request.time.date,
    );
    const listLineTotal = PriceBook.lineAmount(line.quantityMilli, listUnitPrice);
    const base = {
      productLocationId: product.productLocationId,
      productId: product.productId,
      baseUnitPrice: listUnitPrice,
      listUnitPrice,
      listLineTotal,
      customUnitPrice: line.customUnitPrice,
    };
    const context = request.context;
    if (line.customUnitPrice !== null || context === null) {
      const lineSubtotal =
        line.customUnitPrice === null
          ? listLineTotal
          : PriceBook.lineAmount(line.quantityMilli, line.customUnitPrice);
      return {
        ...base,
        lineSubtotal,
        discountTotal: 0,
        lineTotal: lineSubtotal,
        adjustments: [],
        discount: null,
        eligible: [],
        ineligible: [],
      };
    }
    // AMOUNT: per piece for counted products, once per line for weighed or measured ones.
    const perPiece = product.unit === ProductUnit.PIECE;
    const options = this.lineDiscounts(
      this.productContext(product),
      [line.sellerStaffId],
      listLineTotal,
      visitListTotal,
      request.time,
      context,
      context.client.productsDiscountBp,
      (value, listPrice) =>
        listPrice -
        (perPiece ? PriceBook.lineAmount(line.quantityMilli, value) : value),
      context.visitStartMs === null,
    );
    const chosen = this.choose(options.eligible, context.choice?.[index]);
    const discountTotal =
      chosen === null || chosen.amount <= 0 ? 0 : chosen.amount;
    const discount: PriceAdjustment | null =
      chosen === null || discountTotal === 0
        ? null
        : {
            kind: chosen.kind,
            ruleId: chosen.ruleId,
            title: chosen.title,
            publicTitle: chosen.publicTitle,
            valueType: chosen.valueType,
            value: chosen.value,
            amount: -discountTotal,
          };
    return {
      ...base,
      lineSubtotal: listLineTotal,
      discountTotal,
      lineTotal: listLineTotal - discountTotal,
      adjustments: discount === null ? [] : [discount],
      discount,
      eligible: options.eligible,
      ineligible: options.ineligible,
    };
  }

  /**
   * First reason a promotion does not reach the product lines: DISABLED, then targets
   * (EXCLUDED wins over NOT_TARGETED), then the schedule, then its conditions on the first
   * targeted line. Targets go before the schedule: a promotion for services or for other
   * products does not relate to the line at any time.
   */
  private productPromotionReason(
    rule: CompiledRule,
    request: ProductQuoteRequest,
    quote: ProductsQuote,
  ): PriceRuleSkipReason | null {
    const context = request.context;
    if (context === null) return null;
    if (!rule.enabled) return PriceRuleSkipReason.DISABLED;
    const contexts = request.lines.map((line) =>
      this.productContext(this.requireProduct(line.productLocationId)),
    );
    const targetReason = this.targetReason(rule, contexts);
    if (targetReason !== null) return targetReason;
    const { day } = this.promotions.onDate(request.time.date);
    const timeReason = rule.timeReason(day, request.time.minute);
    if (timeReason !== null) return timeReason;
    const index = contexts.findIndex(
      (target) => rule.targetReason(target) === null,
    );
    return (
      rule.promotion?.conditionReason({
        context,
        day,
        staffIds: [request.lines[index].sellerStaffId],
        visitListTotal: request.otherListTotal + quote.listTotal,
        noVisit: context.visitStartMs === null,
      }) ?? null
    );
  }

  /** The promo code on product lines, by the stage 4 algorithm. */
  private productPromoCodeResult(
    request: ProductQuoteRequest,
    quote: ProductsQuote,
  ): PromoCodeResult | null {
    const context = request.context;
    const code = context?.promoCode?.trim().toUpperCase() ?? '';
    if (context === null || code === '') return null;
    const rule = this.promotions.rules.find(
      (item) => item.promotion?.promoCode === code,
    );
    if (!rule)
      return {
        code,
        status: PromoCodeStatus.NOT_FOUND,
        ruleId: null,
        reason: null,
        minVisitTotal: null,
      };
    const result = (
      status: PromoCodeStatus,
      reason: PriceRuleSkipReason | null = null,
    ): PromoCodeResult => ({
      code,
      status,
      ruleId: rule.id,
      reason,
      minVisitTotal:
        reason === PriceRuleSkipReason.BELOW_MIN_TOTAL
          ? (rule.promotion?.minVisitTotal ?? null)
          : null,
    });
    if (quote.lines.some((line) => line.discount?.ruleId === rule.id))
      return result(PromoCodeStatus.APPLIED);
    if (
      quote.lines.some((line) =>
        line.eligible.some((candidate) => candidate.ruleId === rule.id),
      )
    )
      return result(PromoCodeStatus.BETTER_APPLIED);
    const reason = this.productPromotionReason(rule, request, quote);
    return reason === null
      ? result(PromoCodeStatus.BETTER_APPLIED)
      : result(PromoCodeStatus.NOT_APPLICABLE, reason);
  }

  private requireProduct(productLocationId: string): PricingProductEntry {
    const product = this.products.get(productLocationId);
    if (!product)
      throw new Error(`Product ${productLocationId} is not priced`);
    return product;
  }

  /** Null when the rule targets some line; otherwise EXCLUDED wins over NOT_TARGETED. */
  private targetReason(
    rule: CompiledRule,
    contexts: readonly RuleTargetContext[],
  ): PriceRuleSkipReason | null {
    let reason: PriceRuleSkipReason = PriceRuleSkipReason.NOT_TARGETED;
    for (const context of contexts) {
      const contextReason = rule.targetReason(context);
      if (contextReason === null) return null;
      if (contextReason === PriceRuleSkipReason.EXCLUDED)
        reason = contextReason;
    }
    return reason;
  }

  /**
   * Enabled rules that target some line of the request, at any time: surcharges, and
   * promotions when the request has a context.
   */
  private relevantRules(request: QuoteRequest): Set<CompiledRule> {
    const contexts = this.targetContexts(request);
    const reaches = (rule: CompiledRule) =>
      rule.enabled &&
      contexts.some((context) => rule.targetReason(context) === null);
    return new Set([
      ...this.rules.rules.filter(reaches),
      ...(request.context ? this.promotions.rules.filter(reaches) : []),
    ]);
  }

  /** 0 and every interval edge of these rules, ascending: where the price may change. */
  private segmentStarts(rules: readonly CompiledRule[]): number[] {
    const starts = new Set<number>([0]);
    for (const rule of rules)
      for (const edge of rule.breakpoints) starts.add(edge);
    return [...starts].sort((a, b) => a - b);
  }

  private coveringAt(
    rules: readonly CompiledRule[],
    minute: number,
  ): CompiledRule[] {
    return rules.filter((rule) => rule.coversMinute(minute));
  }

  /** Staff price of a separate service and the layer that explains it, if any. */
  private staffLayer(
    serviceId: string,
    staffId: string | null,
    date: string,
  ): StaffPriceLayer {
    const base = this.basePriceAt(serviceId, date);
    const staff = staffId === null ? undefined : this.staff.get(staffId);
    if (!staff) return { price: base, adjustment: null };
    const service = this.requireService(serviceId);
    // A null price on a date drops the personal or level price: the next layer applies.
    const personal = this.timeline.resolve(
      staffKey(serviceId, staff.id),
      date,
      staff.servicePrices[serviceId] ?? null,
    );
    if (personal !== null)
      return this.layer(PriceAdjustmentKind.STAFF, staff.name, personal, base);
    const level = staff.levelId ? this.levels.get(staff.levelId) : undefined;
    const levelPrice = level
      ? this.timeline.resolve(
          levelKey(serviceId, level.id),
          date,
          service.levelPrices[level.id] ?? null,
        )
      : null;
    if (level && levelPrice !== null)
      return this.layer(
        PriceAdjustmentKind.LEVEL,
        level.name,
        levelPrice,
        base,
      );
    return { price: base, adjustment: null };
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

  private requireBundle(bundleId: string): PricingBundleEntry {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) throw new Error(`Bundle ${bundleId} is not priced`);
    return bundle;
  }

  private requireService(serviceId: string): PricingServiceEntry {
    const service = this.services.get(serviceId);
    if (!service) throw new Error(`Service ${serviceId} is not priced`);
    return service;
  }
}
