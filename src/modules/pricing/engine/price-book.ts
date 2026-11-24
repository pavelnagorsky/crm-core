import { BundleAllocationCalculator } from './calculators/bundle-allocation.calculator.js';
import { RoundingCalculator } from './calculators/rounding.calculator.js';
import { CompiledRule } from './compile/compiled-rule.js';
import { CompiledRuleSet } from './compile/compiled-rule-set.js';
import { RuleTargetContext } from './compile/interfaces/rule-target-context.interface.js';
import { RuleCompiler } from './compile/rule-compiler.js';
import {
  CLIENT_DISCOUNT_PUBLIC_TITLE,
  CLIENT_DISCOUNT_TITLE,
} from './constants/discount-titles.constants.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { DiscountChoiceMode } from './enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { PriceRuleKind } from './enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from './enums/price-rule-skip-reason.enum.js';
import { PriceValueType } from './enums/price-value-type.enum.js';
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
import { PricingBundleEntry } from './interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from './interfaces/pricing-level-entry.interface.js';
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

/**
 * Prices of one location, indexed once (docs/pricing-plan.md 2.1, 2.2, 2.5, 3.2, 5.2). Pure:
 * no clock, no database. Build one per request and reuse it for every slot. The caller
 * validates that requests match the snapshot (PricingFacade).
 *
 * Discounts (docs/pricing-stage4-api.md) need a quote context: candidates are the promotions
 * whose schedule, targets and conditions hold, plus the client discount; the biggest discount
 * in money wins (on a tie the client discount, then the earlier promotion). The discounted
 * price is rounded down to the location step, never below 0.
 */
export class PriceBook {
  private readonly services: Map<string, PricingServiceEntry>;
  private readonly bundles: Map<string, PricingBundleEntry>;
  private readonly levels: Map<string, PricingLevelEntry>;
  private readonly staff: Map<string, PricingStaffEntry>;
  private readonly rules: CompiledRuleSet;
  private readonly promotions: CompiledRuleSet;
  private readonly roundingStep: number;

  constructor(snapshot: PricingSnapshot) {
    this.services = new Map(snapshot.services.map((item) => [item.id, item]));
    this.bundles = new Map(snapshot.bundles.map((item) => [item.id, item]));
    this.levels = new Map(snapshot.levels.map((item) => [item.id, item]));
    this.staff = new Map(snapshot.staff.map((item) => [item.id, item]));
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

  /** Promotions that are not archived (enabled or not), in display order. */
  promotionRules(): readonly CompiledRule[] {
    return this.promotions.rules;
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
      return this.staffPrice(serviceId, staffId);
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
    const flat = this.price(request, []).total;
    const relevant = this.relevantRules(request);
    if (relevant.size === 0 || dates.length === 0)
      return { min: flat, max: flat };

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const date of dates) {
      const { surcharges, edges } = this.dayRules(date, relevant);
      if (edges.length === 0) {
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
      );
      const key = JSON.stringify(
        quote.lines.map((line) => [line.listPrice, line.total, line.adjustments]),
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

  private price(
    request: QuoteRequest,
    active: readonly CompiledRule[],
  ): VisitQuote {
    if (request.bundleId !== null) this.requireBundle(request.bundleId);
    const lines = this.isFixedBundle(request.bundleId)
      ? this.fixedBundleLines(request, active)
      : this.separateLines(request, active);
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
  ): LineQuote[] {
    const listed = request.lines.map((line) =>
      this.separateLine(line, request.bundleId, active),
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
        {
          serviceId: service.id,
          categoryId: service.categoryId,
          bundleId: request.bundleId,
        },
        [item.line.staffId],
        item.listPrice,
        visitListTotal,
        request.visit,
        context,
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
  ): ListedLine {
    const service = this.requireService(line.serviceId);
    const layer = this.staffLayer(line.serviceId, line.staffId);
    const surcharges = this.surcharges(
      active,
      { serviceId: service.id, categoryId: service.categoryId, bundleId },
      layer.price,
    );
    const raw = layer.price + this.sumOf(surcharges);
    const listPrice = this.listPrice(layer.price, raw);
    return {
      line,
      basePrice: service.price,
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
        adjustments: [
          ...lineSurcharges,
          ...this.roundingAdjustments(rounding),
        ],
      };
    });

    const context = request.context ?? null;
    const none: LineDiscountOptions = { eligible: [], ineligible: [] };
    if (context === null)
      return listed.map((item) => this.lineQuote(item, null, none));
    const options = this.lineDiscounts(
      { serviceId: null, categoryId: null, bundleId: bundle.id },
      request.lines.map((line) => line.staffId),
      bundleList,
      bundleList,
      request.visit,
      context,
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
   */
  private lineDiscounts(
    target: RuleTargetContext,
    staffIds: readonly (string | null)[],
    listPrice: number,
    visitListTotal: number,
    visit: VisitTime | null,
    context: QuoteContext,
  ): LineDiscountOptions {
    const eligible: DiscountCandidate[] = [];
    const ineligible: PromotionSkip[] = [];
    const { client } = context;
    if (client.known && client.discountBp !== null && client.discountBp > 0)
      eligible.push(
        this.candidate(
          PriceAdjustmentKind.CLIENT_DISCOUNT,
          null,
          CLIENT_DISCOUNT_TITLE,
          CLIENT_DISCOUNT_PUBLIC_TITLE,
          PriceValueType.PERCENT,
          Math.min(client.discountBp, FULL_PERCENT_BP),
          listPrice,
        ),
      );
    if (visit !== null && !this.promotions.isEmpty) {
      const { day } = this.promotions.onDate(visit.date);
      const check = { context, day, staffIds, visitListTotal };
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
  ): DiscountCandidate {
    const raw =
      valueType === PriceValueType.PERCENT
        ? listPrice - RoundingCalculator.percent(listPrice, value)
        : listPrice - value;
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
    switch (choice?.mode ?? DiscountChoiceMode.AUTO) {
      case DiscountChoiceMode.NONE:
        return null;
      case DiscountChoiceMode.RULE:
        return (
          eligible.find(
            (candidate) =>
              candidate.kind === PriceAdjustmentKind.PROMOTION &&
              candidate.ruleId === choice?.ruleId,
          ) ?? null
        );
      case DiscountChoiceMode.CLIENT_DISCOUNT:
        return (
          eligible.find(
            (candidate) =>
              candidate.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
          ) ?? null
        );
      default:
        return eligible[0] ?? null;
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
