import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { DashboardRangeDto } from '../../dashboard/dto/dashboard-range.dto.js';
import { DashboardRangeService } from '../../dashboard/services/dashboard-range.service.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import {
  PRICE_ANALYTICS_EXPORT_CANDIDATES_LIMIT,
  PRICE_ANALYTICS_EXPORT_LIMIT,
  PRICE_ANALYTICS_NO_STAFF,
  PRICE_ANALYTICS_RULE_REASONS,
} from '../constants/price-analytics.constants.js';
import { PriceAnalyticsItemsFilterDto } from '../dto/price-analytics-items-filter.dto.js';
import { PriceAnalyticsItemsRequestDto } from '../dto/price-analytics-items-request.dto.js';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsExportData } from '../interfaces/price-analytics-export-data.interface.js';
import { PriceAnalyticsFilter } from '../interfaces/price-analytics-filter.interface.js';
import { PriceAnalyticsFilteredItems } from '../interfaces/price-analytics-filtered-items.interface.js';
import { PriceAnalyticsItem } from '../interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsItemsPage } from '../interfaces/price-analytics-items-page.interface.js';
import { PriceAnalyticsQuery } from '../interfaces/price-analytics-query.interface.js';
import { PriceAnalyticsRuleInfo } from '../interfaces/price-analytics-rule-info.interface.js';
import { PriceAnalyticsStaffInfo } from '../interfaces/price-analytics-staff-info.interface.js';
import { PriceAnalyticsSummary } from '../interfaces/price-analytics-summary.interface.js';
import {
  priceAnalyticsGroupCounts,
  priceAnalyticsListItems,
  priceAnalyticsReasonRows,
  priceAnalyticsRuleIds,
  priceAnalyticsStaffRows,
  priceAnalyticsTotals,
  withRuleNames,
} from '../rules/price-analytics-report.rules.js';
import { PriceRulesService } from './price-rules.service.js';

const MS_BEFORE_END = 1;

/**
 * The discounts and surcharges report (docs/pricing-stage8-api.md): the bookings module
 * splits the services, the orders module the product lines, this service puts them together.
 */
@Injectable()
export class PriceAnalyticsService {
  constructor(
    private readonly ranges: DashboardRangeService,
    private readonly bookings: BookingsFacade,
    private readonly orders: OrdersFacade,
    private readonly rules: PriceRulesService,
    private readonly staff: StaffService,
  ) {}

  /** The block on the analytics page: totals, the previous period, reasons and staff. */
  async summary(
    locationId: string,
    dto: DashboardRangeDto,
    now = new Date(),
  ): Promise<PriceAnalyticsSummary> {
    const range = await this.ranges.resolve(locationId, dto);
    const [items, previous] = await Promise.all([
      this.load(locationId, {
        from: range.from,
        to: range.to,
        now,
        changedOnly: false,
      }),
      range.compareWithPrevious
        ? this.load(locationId, {
            from: range.previousFrom,
            to: range.previousTo,
            now,
            changedOnly: false,
          })
        : Promise.resolve(null),
    ]);
    const [rules, staff] = await Promise.all([
      this.ruleInfos(locationId, priceAnalyticsRuleIds(items)),
      this.staffInfos(locationId, items),
    ]);
    return {
      period: { from: range.from, to: range.to },
      previousPeriod: range.compareWithPrevious
        ? { from: range.previousFrom, to: range.previousTo }
        : null,
      currency: range.currency,
      totals: priceAnalyticsTotals(items),
      previousTotals: previous === null ? null : priceAnalyticsTotals(previous),
      ...priceAnalyticsReasonRows(items, rules),
      ...priceAnalyticsGroupCounts(items),
      staff: priceAnalyticsStaffRows(items, staff),
    };
  }

  /** A page of the items whose price was changed, with totals over the whole filter. */
  async items(
    locationId: string,
    dto: PriceAnalyticsItemsRequestDto,
    now = new Date(),
  ): Promise<PriceAnalyticsItemsPage> {
    const { items, currency } = await this.filtered(locationId, dto, now);
    const start = (dto.page - 1) * dto.pageSize;
    const page = items.slice(start, start + dto.pageSize);
    return {
      items: await this.named(locationId, page),
      totalItems: items.length,
      summary: priceAnalyticsTotals(items),
      currency,
    };
  }

  /** All items of the filter for the export; 400 PRICE_ANALYTICS_EXPORT_TOO_LARGE over the limit. */
  async exportItems(
    locationId: string,
    dto: PriceAnalyticsItemsFilterDto,
    now = new Date(),
  ): Promise<PriceAnalyticsExportData> {
    const { items, timezone, from, to } = await this.filtered(
      locationId,
      dto,
      now,
      true,
    );
    if (items.length > PRICE_ANALYTICS_EXPORT_LIMIT) throw tooLarge();
    return {
      items: await this.named(locationId, items),
      totals: priceAnalyticsTotals(items),
      timezone,
      fromDay: TimeUtils.zonedDateStr(from, timezone),
      toDay: TimeUtils.zonedDateStr(
        new Date(to.getTime() - MS_BEFORE_END),
        timezone,
      ),
    };
  }

  private async filtered(
    locationId: string,
    dto: PriceAnalyticsItemsFilterDto,
    now: Date,
    forExport = false,
  ): Promise<PriceAnalyticsFilteredItems> {
    const filter = filterOf(dto);
    const range = await this.ranges.resolve(locationId, dto);
    const query: PriceAnalyticsQuery = {
      from: range.from,
      to: range.to,
      now,
      changedOnly: true,
      staffId: filter.staffId,
      reason: filter.reason,
      ruleId: filter.ruleId,
    };
    // The export refuses a clearly too large period before loading any row.
    if (
      forExport &&
      (await this.countCandidates(locationId, query, filter.itemType)) >
        PRICE_ANALYTICS_EXPORT_CANDIDATES_LIMIT
    )
      throw tooLarge();
    const items = await this.load(locationId, query, filter.itemType);
    return {
      items: priceAnalyticsListItems(items, filter),
      currency: range.currency,
      timezone: range.timezone,
      from: range.from,
      to: range.to,
    };
  }

  /** Rows the SQL pre-filters of the loaders select, services and product lines together. */
  private async countCandidates(
    locationId: string,
    query: PriceAnalyticsQuery,
    itemType?: PriceAnalyticsItemType,
  ): Promise<number> {
    const [services, products] = await Promise.all([
      itemType === PriceAnalyticsItemType.PRODUCT
        ? 0
        : this.bookings.countPriceAnalyticsCandidates(locationId, query),
      itemType === PriceAnalyticsItemType.SERVICE
        ? 0
        : this.orders.countPriceAnalyticsCandidates(locationId, query),
    ]);
    return services + products;
  }

  private async load(
    locationId: string,
    query: PriceAnalyticsQuery,
    itemType?: PriceAnalyticsItemType,
  ): Promise<PriceAnalyticsItem[]> {
    const [services, products] = await Promise.all([
      itemType === PriceAnalyticsItemType.PRODUCT
        ? []
        : this.bookings.getPriceAnalyticsItems(locationId, query),
      itemType === PriceAnalyticsItemType.SERVICE
        ? []
        : this.orders.getPriceAnalyticsItems(locationId, query),
    ]);
    return [...services, ...products];
  }

  /** Current rule and staff names on the items shown. */
  private async named(
    locationId: string,
    items: PriceAnalyticsItem[],
  ): Promise<PriceAnalyticsItem[]> {
    if (items.length === 0) return items;
    const [rules, staff] = await Promise.all([
      this.ruleInfos(locationId, priceAnalyticsRuleIds(items)),
      this.staffInfos(locationId, items),
    ]);
    return withRuleNames(items, rules).map((item) => ({
      ...item,
      staffName:
        item.staffId === null
          ? null
          : (staff.get(item.staffId)?.name ?? item.staffName),
    }));
  }

  private async ruleInfos(
    locationId: string,
    ids: readonly string[],
  ): Promise<Map<string, PriceAnalyticsRuleInfo>> {
    const rules = await this.rules.listByIds(locationId, ids);
    return new Map(
      rules.map((rule) => [
        rule.id,
        {
          id: rule.id,
          name: rule.name,
          kind: rule.kind,
          scenario: rule.scenario,
          valueType: rule.valueType,
          value: rule.value,
          promoCode: rule.promoCode,
          archived: rule.archivedAt !== null,
        },
      ]),
    );
  }

  private async staffInfos(
    locationId: string,
    items: readonly PriceAnalyticsItem[],
  ): Promise<Map<string, PriceAnalyticsStaffInfo>> {
    if (!items.some((item) => item.staffId !== null)) return new Map();
    const staff = await this.staff.listInLocation(locationId);
    return new Map(
      staff.map((member) => [
        member.id,
        { name: member.name, avatarUrl: member.avatarFile?.url ?? null },
      ]),
    );
  }
}

function tooLarge(): AppException {
  return new AppException(
    ErrorCode.PRICE_ANALYTICS_EXPORT_TOO_LARGE,
    HttpStatus.BAD_REQUEST,
    { limit: PRICE_ANALYTICS_EXPORT_LIMIT },
  );
}

/** 400 PRICE_ANALYTICS_FILTER_INVALID: a rule filter without the reason PROMOTION or SURCHARGE. */
function filterOf(dto: PriceAnalyticsItemsFilterDto): PriceAnalyticsFilter {
  if (
    dto.ruleId !== undefined &&
    (dto.reason === undefined || !PRICE_ANALYTICS_RULE_REASONS.has(dto.reason))
  )
    throw new AppException(
      ErrorCode.PRICE_ANALYTICS_FILTER_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  return {
    reason: dto.reason,
    ruleId: dto.ruleId,
    staffId:
      dto.staffId === undefined
        ? undefined
        : dto.staffId === PRICE_ANALYTICS_NO_STAFF
          ? null
          : dto.staffId,
    itemType: dto.itemType,
  };
}
