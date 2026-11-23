import { HttpStatus, Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { RuleTargetContext } from '../engine/compile/interfaces/rule-target-context.interface.js';
import { PriceAdjustmentKind } from '../engine/enums/price-adjustment-kind.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PricingServiceEntry } from '../engine/interfaces/pricing-service-entry.interface.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { PriceBook } from '../engine/price-book.js';
import { PriceRulePreviewRequestDto } from '../dto/price-rule-preview-request.dto.js';
import { PriceRulePreview } from '../interfaces/price-rule-preview.interface.js';
import { PriceRulePreviewExample } from '../interfaces/price-rule-preview-example.interface.js';
import { PriceRulePreviewExampleRow } from '../interfaces/price-rule-preview-example-row.interface.js';
import { PriceRulePreviewReplaced } from '../interfaces/price-rule-preview-replaced.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { withLevelScope } from '../rules/price-level-scope.rules.js';
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
import { PriceRuleCatalogService } from './price-rule-catalog.service.js';
import { PriceRuleReadService } from './price-rule-read.service.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

const EXAMPLE_LIMIT = 3;
/** Start minute of the example for a rule without intervals: noon. */
const WHOLE_DAY_EXAMPLE_MINUTE = 12 * 60;

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
  ) {}

  async preview(
    locationId: string,
    dto: PriceRulePreviewRequestDto,
    now = new Date(),
  ): Promise<PriceRulePreview> {
    const rule = normalizePriceRuleInput(dto.rule);
    await this.ruleCatalog.assertTargetsInLocation(locationId, rule.targets);
    const existing = dto.ruleId
      ? await this.reads.findRule(locationId, dto.ruleId)
      : null;
    if (existing?.archivedAt)
      throw new AppException(ErrorCode.PRICE_RULE_ARCHIVED, HttpStatus.CONFLICT);
    const draft = draftPriceRuleRecord(locationId, rule, {
      id: existing?.id ?? DRAFT_PRICE_RULE_ID,
      enabled: rule.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
    });

    const [snapshot, live, { timezone }, catalog] = await Promise.all([
      this.snapshots.load(locationId, ReadConsistency.CACHED),
      this.reads.listForSnapshot(locationId),
      this.locations.getBookingSettings(locationId),
      this.serviceCatalog.loadCatalogSnapshot(
        locationId,
        ReadConsistency.CACHED,
      ),
    ]);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const others = live.filter((item) => item.id !== draft.id);
    // The example shows what the rule does when it works, also if it is switched off now.
    const entry = toPricingRuleEntry({ ...draft, enabled: true });
    const nextDate = nextRuleDate(entry, today);
    const withDraft: PricingSnapshot = {
      ...snapshot,
      rules: [...others.map(toPricingRuleEntry), entry],
    };
    const titles = new Map(
      catalog.services
        .filter((service) => service.status === ServiceStatus.ACTIVE)
        .map((service) => [service.id, service.title]),
    );
    return {
      status: priceRuleSchedule(draft, today).status,
      nextDate,
      examples:
        nextDate === null
          ? []
          : this.examples(withDraft, entry, titles, nextDate),
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
    };
  }

  /**
   * Up to 3 services the rule reaches, those with a price on another level first: the first
   * service at the base level and at one other level, the rest at the base level.
   */
  private examples(
    snapshot: PricingSnapshot,
    entry: PricingRuleEntry,
    titles: ReadonlyMap<string, string>,
    date: string,
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
          compiled.targetReason({
            serviceId: service.id,
            categoryId: service.categoryId,
            bundleId: null,
          }) === null,
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
    const baseBook = new PriceBook(snapshot);
    return rows.slice(0, EXAMPLE_LIMIT).map((row) => {
      const scoped =
        row.levelId === null ? null : withLevelScope(snapshot, row.levelId);
      const book = scoped ? new PriceBook(scoped.snapshot) : baseBook;
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
      }).lines;
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
      ...snapshot.services.map((service) => ({
        serviceId: service.id,
        categoryId: service.categoryId,
        bundleId: null,
      })),
      ...snapshot.bundles.map((bundle) => ({
        serviceId: null,
        categoryId: null,
        bundleId: bundle.id,
      })),
    ];
    const draftRule = new CompiledRule(toPricingRuleEntry(draft));
    return others
      .filter((other) => other.enabled && !isExclusiveHoliday(other))
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
