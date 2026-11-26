import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceRuleKind, Prisma, ServiceStatus } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import {
  PRICE_RULE_STATS_DAYS,
  PROMOTION_PRODUCT_EXAMPLE_LIMIT,
} from '../constants/price-rule.constants.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import {
  productTargetContext,
  serviceTargetContext,
} from '../engine/compile/rule-target-contexts.js';
import { RuleTargetContext } from '../engine/compile/interfaces/rule-target-context.interface.js';
import { PriceAdjustmentKind } from '../engine/enums/price-adjustment-kind.enum.js';
import { PriceRuleKind as EngineRuleKind } from '../engine/enums/price-rule-kind.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../engine/enums/promotion-client-filter.enum.js';
import { PricingProductEntry } from '../engine/interfaces/pricing-product-entry.interface.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PricingServiceEntry } from '../engine/interfaces/pricing-service-entry.interface.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../engine/price-book.js';
import { PriceRulePreviewRequestDto } from '../dto/price-rule-preview-request.dto.js';
import { PriceRulePreview } from '../interfaces/price-rule-preview.interface.js';
import { PriceRulePreviewExample } from '../interfaces/price-rule-preview-example.interface.js';
import { PriceRulePreviewExampleRow } from '../interfaces/price-rule-preview-example-row.interface.js';
import { PriceRulePreviewReplaced } from '../interfaces/price-rule-preview-replaced.interface.js';
import { PriceRulePreviewSources } from '../interfaces/price-rule-preview-sources.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { PromotionMatchTarget } from '../interfaces/promotion-match-target.interface.js';
import { PromotionOverlapScope } from '../interfaces/promotion-overlap-scope.interface.js';
import { PromotionProductExample } from '../interfaces/promotion-product-example.interface.js';
import { withLevelScope } from '../rules/price-level-scope.rules.js';
import { affectedServiceCount } from '../rules/price-rule-coverage.rules.js';
import {
  DRAFT_PRICE_RULE_ID,
  draftPriceRuleRecord,
} from '../rules/price-rule-draft.rules.js';
import { toPricingRuleEntry } from '../rules/price-rule-entry.rules.js';
import {
  findHolidayConflicts,
  isExclusiveHoliday,
} from '../rules/price-rule-holiday.rules.js';
import { normalizePriceRuleInput } from '../rules/price-rule-input.rules.js';
import {
  nextRuleDate,
  priceRuleSchedule,
} from '../rules/price-rule-schedule.rules.js';
import {
  buildPromotionConditions,
  promotionConditionsInput,
} from '../rules/promotion-conditions.rules.js';
import { promotionMatches } from '../rules/promotion-matches.rules.js';
import { findPromotionOverlaps } from '../rules/promotion-overlap.rules.js';
import { PriceRuleCatalogService } from './price-rule-catalog.service.js';
import { PriceRuleReadService } from './price-rule-read.service.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

const EXAMPLE_LIMIT = 3;
/** Start minute of the example for a rule without intervals: noon. */
const WHOLE_DAY_EXAMPLE_MINUTE = 12 * 60;
const MS_PER_DAY = 86_400_000;
/** One unit of a product in thousandths: product examples are priced per 1 шт / 1 ед. */
const ONE_UNIT_MILLI = 1000;

/**
 * What a rule input would do, without saving it: validated like a save, put into the
 * location's rules in place of the rule being edited, and priced by the same engine. Nothing
 * is written and the price cache is left alone.
 */
@Injectable()
export class PriceRulePreviewService {
  constructor(
    private readonly reads: PriceRuleReadService,
    private readonly ruleCatalog: PriceRuleCatalogService,
    private readonly snapshots: PricingSnapshotService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly locations: LocationService,
    private readonly staff: StaffService,
    private readonly products: ProductsService,
  ) {}

  /**
   * `sources.loadMatchItems` gives the past bookings for matches30d of a promotion; without
   * it the promotion preview has none (null). `loadSaleLines` adds the separate sales,
   * `loadPurchaseCosts` the last purchase costs for "below cost".
   */
  async preview(
    locationId: string,
    dto: PriceRulePreviewRequestDto,
    now = new Date(),
    sources: PriceRulePreviewSources = {},
  ): Promise<PriceRulePreview> {
    const rule = normalizePriceRuleInput(dto.rule);
    await this.ruleCatalog.assertTargetsInLocation(locationId, rule.targets);
    const existing = dto.ruleId
      ? await this.reads.findRule(locationId, dto.ruleId)
      : null;
    if (existing?.archivedAt)
      throw new AppException(
        ErrorCode.PRICE_RULE_ARCHIVED,
        HttpStatus.CONFLICT,
      );
    const draft = draftPriceRuleRecord(locationId, rule, {
      id: existing?.id ?? DRAFT_PRICE_RULE_ID,
      enabled: rule.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
    });
    const promotion = draft.kind === PriceRuleKind.PROMOTION;

    const [snapshot, live, { timezone, currency }, catalog, coverage] =
      await Promise.all([
        this.snapshots.load(locationId, ReadConsistency.CACHED),
        this.reads.listForSnapshot(locationId),
        this.locations.getBookingSettings(locationId),
        this.serviceCatalog.loadCatalogSnapshot(
          locationId,
          ReadConsistency.CACHED,
        ),
        this.ruleCatalog.loadCoverage(locationId),
      ]);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const others = live.filter((item) => item.id !== draft.id);
    // The example shows what the rule does when it works, also if it is switched off now.
    const entry = toPricingRuleEntry({ ...draft, enabled: true });
    const nextDate = nextRuleDate(entry, today);
    const titles = new Map(
      catalog.services
        .filter((service) => service.status === ServiceStatus.ACTIVE)
        .map((service) => [service.id, service.title]),
    );
    const serviceCount = affectedServiceCount(
      {
        appliesToAllServices: draft.appliesToAllServices,
        targets: draft.targets.map((target) => ({
          type: target.targetType,
          id: target.targetId,
          excluded: target.excluded,
        })),
      },
      coverage,
    );
    const base = {
      status: priceRuleSchedule(draft, today).status,
      nextDate,
      serviceCount,
      totalServiceCount: coverage.services.length,
      totalProductCount: snapshot.products.length,
    };

    if (!promotion) {
      const withDraft: PricingSnapshot = {
        ...snapshot,
        rules: [...others.map(toPricingRuleEntry), entry],
      };
      return {
        ...base,
        examples:
          nextDate === null
            ? []
            : this.examples(withDraft, entry, titles, nextDate, null),
        replaces: this.replaces(draft, others, withDraft),
        conflicts: isExclusiveHoliday(draft)
          ? findHolidayConflicts(
              {
                dates: draft.dates.map((item) =>
                  TimeUtils.dateOnlyStr(item.date),
                ),
                yearly: draft.yearly,
              },
              others.filter(isExclusiveHoliday),
            )
          : [],
        conditions: [],
        productCount: 0,
        productExamples: [],
        belowCostCount: 0,
        overlaps: [],
        matches30d: null,
      };
    }

    // The example shows the discount itself: other promotions and the conditions on the
    // client, booking moment, staff and limits are left out, surcharges stay.
    const exampleEntry: PricingRuleEntry = {
      ...entry,
      promotion: entry.promotion && {
        ...entry.promotion,
        bookingFrom: null,
        bookingTo: null,
        minLeadMinutes: null,
        maxLeadMinutes: null,
        channels: [PromotionChannel.ONLINE, PromotionChannel.ADMIN],
        staffIds: [],
        clientFilter: PromotionClientFilter.ANY,
        birthdayWindowDays: null,
        promoCode: null,
        usageLimitTotal: null,
        usageLimitPerClient: null,
        minVisitTotal: null,
      },
    };
    const withDraft: PricingSnapshot = {
      ...snapshot,
      rules: [
        ...others
          .filter((item) => item.kind === PriceRuleKind.SURCHARGE)
          .map(toPricingRuleEntry),
        exampleEntry,
      ],
    };
    const statsFrom = new Date(
      now.getTime() - PRICE_RULE_STATS_DAYS * MS_PER_DAY,
    );
    const [targetNames, staffNames, items, saleLines, priced] =
      await Promise.all([
        this.ruleCatalog.nameTargets(
          locationId,
          draft.targets.map((target) => ({
            type: target.targetType,
            id: target.targetId,
            excluded: target.excluded,
          })),
        ),
        this.staff.namesByIds(draft.staff.map((item) => item.staffId)),
        sources.loadMatchItems
          ? sources.loadMatchItems(statsFrom, now)
          : Promise.resolve(null),
        sources.loadSaleLines
          ? sources.loadSaleLines(statsFrom, now)
          : Promise.resolve([]),
        this.products.listPriced(locationId),
      ]);
    const productNames = new Map(
      priced.map((product) => [product.productLocationId, product.name]),
    );
    const exampleRule = new CompiledRule(exampleEntry);
    const reached = snapshot.products.filter(
      (product) =>
        exampleRule.targetReason(
          productTargetContext(product.productId, product.categoryId),
        ) === null,
    );
    const exampleContext: QuoteContext = {
      channel: PromotionChannel.ONLINE,
      nowMs: 0,
      today: nextDate ?? today,
      visitStartMs: null,
      client: {
        known: false,
        isNew: false,
        birthday: null,
        servicesDiscountBp: null,
        productsDiscountBp: null,
      },
      promoCode: null,
      usage: {},
    };
    const productExamples =
      nextDate === null || reached.length === 0
        ? []
        : await this.productExamples(
            withDraft,
            exampleEntry,
            reached,
            productNames,
            nextDate,
            exampleContext,
            sources,
          );
    const scopes: PromotionOverlapScope[] = [
      ...catalog.services
        .filter((service) => service.status === ServiceStatus.ACTIVE)
        .map((service) => ({
          context: serviceTargetContext(service.id, service.categoryId, null),
          title: service.title,
        })),
      ...catalog.bundles.map((bundle) => ({
        context: serviceTargetContext(null, null, bundle.id),
        title: bundle.title,
      })),
      ...snapshot.products.map((product) => ({
        context: productTargetContext(product.productId, product.categoryId),
        title: productNames.get(product.productLocationId) ?? product.productId,
      })),
    ];
    const targets = new Map<string, PromotionMatchTarget>(
      snapshot.services.map((service) => [
        service.id,
        {
          serviceId: service.id,
          categoryId: service.categoryId,
          bundleId: null,
        },
      ]),
    );
    return {
      ...base,
      examples:
        nextDate === null
          ? []
          : this.examples(
              withDraft,
              exampleEntry,
              titles,
              nextDate,
              exampleContext,
            ),
      replaces: [],
      conflicts: [],
      productCount: reached.length,
      productExamples: [...productExamples]
        .sort(
          (a, b) =>
            Number(b.belowCost) - Number(a.belowCost) ||
            a.productName.localeCompare(b.productName, 'ru'),
        )
        .slice(0, PROMOTION_PRODUCT_EXAMPLE_LIMIT),
      belowCostCount: productExamples.filter((example) => example.belowCost)
        .length,
      conditions: buildPromotionConditions(
        promotionConditionsInput(draft, {
          targets: targetNames,
          staffNames: draft.staff.flatMap(({ staffId }) => {
            const name = staffNames.get(staffId);
            return name === undefined ? [] : [name];
          }),
          currency,
          usageCount: null,
        }),
      ),
      overlaps: findPromotionOverlaps(
        entry,
        others
          .filter((item) => item.kind === PriceRuleKind.PROMOTION)
          .map(toPricingRuleEntry),
        scopes,
        today,
      ),
      matches30d:
        items === null
          ? null
          : promotionMatches(
              entry,
              items,
              targets,
              timezone,
              snapshot.roundingStep,
              saleLines,
            ),
    };
  }

  /**
   * Every reached product priced for one unit (1 шт / 1 ед.) at the example date, with the
   * last purchase cost: belowCost when the price after the discount is below the cost of
   * one unit. The cost number is returned only with canReadPurchaseCost.
   */
  private async productExamples(
    snapshot: PricingSnapshot,
    entry: PricingRuleEntry,
    reached: readonly PricingProductEntry[],
    names: ReadonlyMap<string, string>,
    date: string,
    context: QuoteContext,
    sources: PriceRulePreviewSources,
  ): Promise<PromotionProductExample[]> {
    const minute = entry.intervals.length
      ? Math.min(...entry.intervals.map((interval) => interval.start))
      : WHOLE_DAY_EXAMPLE_MINUTE;
    const book = new PriceBook(
      snapshot,
      TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
    );
    const quote = book.quoteProducts({
      lines: reached.map((product) => ({
        productLocationId: product.productLocationId,
        quantityMilli: ONE_UNIT_MILLI,
        customUnitPrice: null,
        sellerStaffId: null,
      })),
      time: { date, minute },
      context,
      otherListTotal: 0,
    });
    const costs = sources.loadPurchaseCosts
      ? await sources.loadPurchaseCosts(
          reached.map((product) => product.productLocationId),
        )
      : new Map<string, Prisma.Decimal>();
    return quote.lines.map((line, index) => {
      const product = reached[index];
      const cost = costs.get(product.productLocationId) ?? null;
      const after = MoneyUtils.fromMinor(line.lineTotal);
      return {
        productId: product.productId,
        productName: names.get(product.productLocationId) ?? product.productId,
        unit: product.unit,
        before: MoneyUtils.fromMinor(line.listLineTotal),
        after,
        amount: MoneyUtils.fromMinor(line.discountTotal),
        lastPurchaseUnitCost: sources.canReadPurchaseCost ? cost : null,
        belowCost: cost !== null && after.lt(MoneyUtils.quantize(cost)),
      };
    });
  }

  /**
   * Up to 3 services the rule reaches, those with a price on another level first: the first
   * service at the base level and at one other level, the rest at the base level. A
   * promotion example is priced with `context`: before is the list price, after the
   * discounted one.
   */
  private examples(
    snapshot: PricingSnapshot,
    entry: PricingRuleEntry,
    titles: ReadonlyMap<string, string>,
    date: string,
    context: QuoteContext | null,
  ): PriceRulePreviewExample[] {
    const compiled = new CompiledRule(entry);
    const otherLevelOf = (service: PricingServiceEntry) =>
      snapshot.levels.find(
        (level) =>
          !level.isDefault && service.levelPrices[level.id] !== undefined,
      );
    const affected = snapshot.services
      .filter(
        (service) =>
          titles.has(service.id) &&
          compiled.targetReason(
            serviceTargetContext(service.id, service.categoryId, null),
          ) === null,
      )
      .sort(
        (a, b) =>
          Number(otherLevelOf(b) !== undefined) -
          Number(otherLevelOf(a) !== undefined),
      );
    const baseLevel = snapshot.levels.find((level) => level.isDefault);
    const rows: PriceRulePreviewExampleRow[] = [];
    affected.slice(0, EXAMPLE_LIMIT).forEach((service, index) => {
      const serviceTitle = titles.get(service.id) as string;
      rows.push({
        serviceId: service.id,
        serviceTitle,
        levelId: null,
        levelName: baseLevel?.name ?? null,
      });
      const other = otherLevelOf(service);
      if (index === 0 && other)
        rows.push({
          serviceId: service.id,
          serviceTitle,
          levelId: other.id,
          levelName: other.name,
        });
    });

    const minute = entry.intervals.length
      ? Math.min(...entry.intervals.map((interval) => interval.start))
      : WHOLE_DAY_EXAMPLE_MINUTE;
    const today = TimeUtils.zonedDateStr(new Date(), snapshot.timezone);
    const baseBook = new PriceBook(snapshot, today);
    const promotion = entry.kind === EngineRuleKind.PROMOTION;
    return rows.slice(0, EXAMPLE_LIMIT).map((row) => {
      const scoped =
        row.levelId === null ? null : withLevelScope(snapshot, row.levelId);
      const book = scoped ? new PriceBook(scoped.snapshot, today) : baseBook;
      const [line] = book.quote({
        bundleId: null,
        lines: [
          {
            serviceId: row.serviceId,
            staffId: scoped?.staffId ?? null,
            customPrice: null,
          },
        ],
        visit: { date, minute },
        context,
      }).lines;
      if (promotion)
        return {
          serviceId: row.serviceId,
          serviceTitle: row.serviceTitle,
          levelName: row.levelName,
          before: line.listPrice,
          raw: line.chargedPrice,
          after: line.chargedPrice,
          amount: line.discountTotal,
        };
      const surcharge = line.adjustments
        .filter(
          (adjustment) => adjustment.kind === PriceAdjustmentKind.SURCHARGE,
        )
        .reduce((sum, adjustment) => sum + adjustment.amount, 0);
      return {
        serviceId: row.serviceId,
        serviceTitle: row.serviceTitle,
        levelName: row.levelName,
        before: line.staffPrice,
        raw: line.staffPrice + surcharge,
        after: line.listPrice,
        amount: line.listPrice - line.staffPrice,
      };
    });
  }

  /**
   * An exclusive holiday rule cancels the other surcharges on its dates: the enabled ones
   * that work on one of those dates and reach a service or bundle the draft reaches.
   */
  private replaces(
    draft: PriceRuleRecord,
    others: readonly PriceRuleRecord[],
    snapshot: PricingSnapshot,
  ): PriceRulePreviewReplaced[] {
    if (!isExclusiveHoliday(draft)) return [];
    const days = draft.dates.map((item) =>
      CalendarDayParser.parse(TimeUtils.dateOnlyStr(item.date)),
    );
    const contexts: RuleTargetContext[] = [
      ...snapshot.services.map((service) =>
        serviceTargetContext(service.id, service.categoryId, null),
      ),
      ...snapshot.bundles.map((bundle) =>
        serviceTargetContext(null, null, bundle.id),
      ),
    ];
    const draftRule = new CompiledRule(toPricingRuleEntry(draft));
    return others
      .filter(
        (other) =>
          other.kind === PriceRuleKind.SURCHARGE &&
          other.enabled &&
          !isExclusiveHoliday(other),
      )
      .filter((other) => {
        const rule = new CompiledRule(toPricingRuleEntry(other));
        return (
          days.some((day) => rule.coversDay(day)) &&
          contexts.some(
            (context) =>
              draftRule.targetReason(context) === null &&
              rule.targetReason(context) === null,
          )
        );
      })
      .map((other) => ({
        ruleId: other.id,
        name: other.name,
        scheduleType: other.scheduleType,
        valueType: other.valueType,
        value: other.value,
      }));
  }
}
