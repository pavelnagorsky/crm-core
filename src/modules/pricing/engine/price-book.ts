import { BundleAllocationCalculator } from './calculators/bundle-allocation.calculator.js';
import { RoundingCalculator } from './calculators/rounding.calculator.js';
import { CompiledRule } from './compile/compiled-rule.js';
import { CompiledRuleSet } from './compile/compiled-rule-set.js';
import { RuleTargetContext } from './compile/interfaces/rule-target-context.interface.js';
import { RuleCompiler } from './compile/rule-compiler.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { PriceRuleSkipReason } from './enums/price-rule-skip-reason.enum.js';
import { PriceValueType } from './enums/price-value-type.enum.js';
import { RoundingMode } from './enums/rounding-mode.enum.js';
import { DaySegment } from './interfaces/day-segment.interface.js';
import { LineQuote } from './interfaces/line-quote.interface.js';
import { PriceAdjustment } from './interfaces/price-adjustment.interface.js';
import { PriceRange } from './interfaces/price-range.interface.js';
import { PriceRuleNotApplied } from './interfaces/price-rule-not-applied.interface.js';
import { PriceScope } from './interfaces/price-scope.interface.js';
import { PricingBundleEntry } from './interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from './interfaces/pricing-level-entry.interface.js';
import { PricingServiceEntry } from './interfaces/pricing-service-entry.interface.js';
import { PricingSnapshot } from './interfaces/pricing-snapshot.interface.js';
import { PricingStaffEntry } from './interfaces/pricing-staff-entry.interface.js';
import { QuoteExplanation } from './interfaces/quote-explanation.interface.js';
import { QuoteLineRequest } from './interfaces/quote-line-request.interface.js';
import { QuoteRequest } from './interfaces/quote-request.interface.js';
import { StaffPriceLayer } from './interfaces/staff-price-layer.interface.js';
import { VisitQuote } from './interfaces/visit-quote.interface.js';

const MINUTES_PER_DAY = 1440;
const ROUNDING_TITLE = 'Округление';

/**
 * Prices of one location, indexed once (docs/pricing-plan.md 2.1, 2.2, 2.5, 3.2, 5.2). Pure:
 * no clock, no database. Build one per request and reuse it for every slot. The caller
 * validates that requests match the snapshot (PricingFacade).
 */
export class PriceBook {
  private readonly services: Map<string, PricingServiceEntry>;
  private readonly bundles: Map<string, PricingBundleEntry>;
  private readonly levels: Map<string, PricingLevelEntry>;
  private readonly staff: Map<string, PricingStaffEntry>;
  private readonly rules: CompiledRuleSet;
  private readonly roundingStep: number;

  constructor(snapshot: PricingSnapshot) {
    this.services = new Map(snapshot.services.map((item) => [item.id, item]));
    this.bundles = new Map(snapshot.bundles.map((item) => [item.id, item]));
    this.levels = new Map(snapshot.levels.map((item) => [item.id, item]));
    this.staff = new Map(snapshot.staff.map((item) => [item.id, item]));
    this.rules = RuleCompiler.compile(snapshot.rules);
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
   * Surcharges are left out on purpose: they depend only on the visit start and the
   * service, so the same rules reach every candidate at a given time, and a higher staff
   * price never gives a lower list price. Ranking by staff price stays correct.
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

  /** Price layers of a visit: staff price, surcharges by the visit start, rounding. */
  quote(request: QuoteRequest): VisitQuote {
    return this.price(request, this.activeRules(request));
  }

  /**
   * The quote and every rule that did not reach it, with the first failed check in the
   * order of PriceRuleSkipReason. No visit time: nothing to explain, notApplied is empty.
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
      notApplied.push({ ruleId: rule.id, name: rule.name, reason });
    }
    return { quote, notApplied };
  }

  /**
   * Lowest and highest visit total over these local dates, for "from - to" prices. On each
   * date the day is cut at the interval edges of the rules that reach the scope there, and
   * a visit starting at each cut is priced. Shifts and busy time are not considered. No
   * dates: the price without surcharges.
   */
  priceRange(scope: PriceScope, dates: readonly string[]): PriceRange {
    const request: QuoteRequest = { ...scope, visit: null };
    const flat = this.price(request, []).total;
    const relevant = this.relevantRules(request);
    if (relevant.size === 0 || dates.length === 0)
      return { min: flat, max: flat };

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const date of dates) {
      const dayRules = this.rules
        .onDate(date)
        .rules.filter((rule) => relevant.has(rule));
      if (dayRules.length === 0) {
        min = Math.min(min, flat);
        max = Math.max(max, flat);
        continue;
      }
      for (const start of this.segmentStarts(dayRules)) {
        const { total } = this.price(
          request,
          this.coveringAt(dayRules, start),
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
    const request: QuoteRequest = { ...scope, visit: null };
    const relevant = this.relevantRules(request);
    const dayRules = this.rules
      .onDate(date)
      .rules.filter((rule) => relevant.has(rule));
    const starts = this.segmentStarts(dayRules);

    const segments: DaySegment[] = [];
    let previousKey = '';
    starts.forEach((startMinute, index) => {
      const endMinute = starts[index + 1] ?? MINUTES_PER_DAY;
      const quote = this.price(
        request,
        this.coveringAt(dayRules, startMinute),
      );
      const key = JSON.stringify(quote.lines);
      const last = segments[segments.length - 1];
      if (last && key === previousKey) last.endMinute = endMinute;
      else segments.push({ startMinute, endMinute, quote });
      previousKey = key;
    });
    return segments;
  }

  private activeRules(request: QuoteRequest): CompiledRule[] {
    return request.visit === null ? [] : this.rules.activeAt(request.visit);
  }

  private price(
    request: QuoteRequest,
    active: readonly CompiledRule[],
  ): VisitQuote {
    if (request.bundleId !== null) this.requireBundle(request.bundleId);
    const lines = this.isFixedBundle(request.bundleId)
      ? this.fixedBundleLines(request, active)
      : request.lines.map((line) =>
          this.separateLine(line, request.bundleId, active),
        );
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

  /** A separate service or a SUM bundle line: its own staff price and surcharges. */
  private separateLine(
    line: QuoteLineRequest,
    bundleId: string | null,
    active: readonly CompiledRule[],
  ): LineQuote {
    const service = this.requireService(line.serviceId);
    const layer = this.staffLayer(line.serviceId, line.staffId);
    const surcharges = this.surcharges(
      active,
      { serviceId: service.id, categoryId: service.categoryId, bundleId },
      layer.price,
    );
    const raw = layer.price + this.sumOf(surcharges);
    const listPrice = this.listPrice(layer.price, raw);
    const adjustments = [
      ...(layer.adjustment ? [layer.adjustment] : []),
      ...surcharges.filter((adjustment) => adjustment.amount !== 0),
      ...this.roundingAdjustments(listPrice - raw),
    ];
    return this.lineQuote(
      line,
      service.price,
      layer.price,
      listPrice,
      adjustments,
    );
  }

  /**
   * A FIXED bundle is one package: surcharges and rounding apply to the bundle price, then
   * every layer is split across the lines in proportion to their catalog prices
   * (BundleAllocationCalculator). The bundle price and each surcharge are allocated on
   * their own. Without rounding a line's list price is the sum of its shares; when
   * rounding moved the bundle price, line list prices are an allocation of the rounded
   * bundle price and a line's rounding share is what closes its gap. Either way each
   * line's layers add up to its list price and the lines add up to every bundle layer.
   */
  private fixedBundleLines(
    request: QuoteRequest,
    active: readonly CompiledRule[],
  ): LineQuote[] {
    const bundle = this.requireBundle(request.bundleId as string);
    if (bundle.fixedPrice === null)
      throw new Error(`Fixed bundle ${bundle.id} has no price`);
    const fixedPrice = bundle.fixedPrice;
    const weights = request.lines.map(
      (line) => this.requireService(line.serviceId).price,
    );
    const basePrices = BundleAllocationCalculator.allocate(fixedPrice, weights);

    const surcharges = this.surcharges(
      active,
      { serviceId: null, categoryId: null, bundleId: bundle.id },
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

    return request.lines.map((line, index) => {
      const basePrice = basePrices[index];
      const lineSurcharges = surcharges
        .map((adjustment, k) => ({
          ...adjustment,
          amount: surchargeShares[k][index],
        }))
        .filter((adjustment) => adjustment.amount !== 0);
      const rounding =
        listPrices[index] - basePrice - this.sumOf(lineSurcharges);
      return this.lineQuote(line, basePrice, basePrice, listPrices[index], [
        ...lineSurcharges,
        ...this.roundingAdjustments(rounding),
      ]);
    });
  }

  private lineQuote(
    line: QuoteLineRequest,
    basePrice: number,
    staffPrice: number,
    listPrice: number,
    adjustments: PriceAdjustment[],
  ): LineQuote {
    // The best discount (stage 4) sets discountTotal.
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
      adjustments,
    };
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
      return [
        { serviceId: null, categoryId: null, bundleId: request.bundleId },
      ];
    return request.lines.map((line) => ({
      serviceId: line.serviceId,
      categoryId: this.requireService(line.serviceId).categoryId,
      bundleId: request.bundleId,
    }));
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

  /** Enabled rules that target some line of the request, at any time. */
  private relevantRules(request: QuoteRequest): Set<CompiledRule> {
    const contexts = this.targetContexts(request);
    return new Set(
      this.rules.rules.filter(
        (rule) =>
          rule.enabled &&
          contexts.some((context) => rule.targetReason(context) === null),
      ),
    );
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
