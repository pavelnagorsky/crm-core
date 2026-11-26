import { PriceValueType, Prisma } from '@prisma/client';
import {
  PRICE_ANALYTICS_CHANGES_SEPARATOR,
  PRICE_ANALYTICS_REASON_NAMES,
  PRICE_ANALYTICS_RULE_REASONS,
} from '../constants/price-analytics.constants.js';
import { PriceAnalyticsSource } from '../enums/price-analytics-source.enum.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsChange } from '../interfaces/price-analytics-change.interface.js';
import { PriceAnalyticsCounts } from '../interfaces/price-analytics-counts.interface.js';
import { PriceAnalyticsFilter } from '../interfaces/price-analytics-filter.interface.js';
import { PriceAnalyticsItem } from '../interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsReasonRow } from '../interfaces/price-analytics-reason-row.interface.js';
import { PriceAnalyticsRuleInfo } from '../interfaces/price-analytics-rule-info.interface.js';
import { PriceAnalyticsStaffInfo } from '../interfaces/price-analytics-staff-info.interface.js';
import { PriceAnalyticsStaffRow } from '../interfaces/price-analytics-staff-row.interface.js';
import { PriceAnalyticsTotals } from '../interfaces/price-analytics-totals.interface.js';
import { isDiscount } from './price-analytics-item.rules.js';

const ZERO = new Prisma.Decimal(0);
const MINUS = '−';

/** Sums and distinct bookings, separate sales and clients of the items. */
export function priceAnalyticsTotals(
  items: readonly PriceAnalyticsItem[],
): PriceAnalyticsTotals {
  let regular = ZERO;
  let surcharges = ZERO;
  let discounts = ZERO;
  let received = ZERO;
  for (const item of items) {
    regular = regular.plus(item.regular);
    surcharges = surcharges.plus(item.surcharges);
    discounts = discounts.plus(item.discounts);
    received = received.plus(item.received);
  }
  const counts = distinctCounts(items);
  return {
    regular,
    surcharges,
    discounts,
    received,
    listTotal: regular.plus(surcharges),
    itemsCount: items.length,
    ...counts,
  };
}

/**
 * Distinct counts over the items with any discount reason and over those with any surcharge
 * reason (the total rows of the tabs); counted like the totals.
 */
export function priceAnalyticsGroupCounts(items: readonly PriceAnalyticsItem[]): {
  discountsCounts: PriceAnalyticsCounts;
  surchargesCounts: PriceAnalyticsCounts;
} {
  const counts = (discount: boolean): PriceAnalyticsCounts => {
    const group = items.filter((item) =>
      item.changes.some((change) => isDiscount(change) === discount),
    );
    return { itemsCount: group.length, ...distinctCounts(group) };
  };
  return { discountsCounts: counts(true), surchargesCounts: counts(false) };
}

/**
 * Summary rows per reason: one per rule (PROMOTION, SURCHARGE; a deleted rule by its layer
 * title), one per other reason. Zero rows are left out; amount desc, then name.
 */
export function priceAnalyticsReasonRows(
  items: readonly PriceAnalyticsItem[],
  rules: ReadonlyMap<string, PriceAnalyticsRuleInfo>,
): { discounts: PriceAnalyticsReasonRow[]; surcharges: PriceAnalyticsReasonRow[] } {
  const rows = new Map<
    string,
    { change: PriceAnalyticsChange; items: PriceAnalyticsItem[]; amount: Prisma.Decimal }
  >();
  for (const item of items)
    for (const change of item.changes) {
      const key = reasonKey(change);
      const row = rows.get(key) ?? { change, items: [], amount: ZERO };
      if (row.items[row.items.length - 1] !== item) row.items.push(item);
      row.amount = row.amount.plus(change.amount);
      rows.set(key, row);
    }
  const built = [...rows.values()]
    .filter((row) => row.amount.gt(0))
    .map((row) => {
      const rule =
        row.change.ruleId !== null &&
        PRICE_ANALYTICS_RULE_REASONS.has(row.change.reason)
          ? (rules.get(row.change.ruleId) ?? null)
          : null;
      return {
        discount: isDiscount(row.change),
        row: {
          reason: row.change.reason,
          rule,
          name: rule?.name ?? reasonName(row.change),
          itemsCount: row.items.length,
          ...distinctCounts(row.items),
          amount: row.amount,
          sharePct: 0,
        },
      };
    });
  return {
    discounts: withShares(built.filter((row) => row.discount).map((row) => row.row)),
    surcharges: withShares(built.filter((row) => !row.discount).map((row) => row.row)),
  };
}

/** Per staff member or seller (null: none); zero rows left out; received desc, then name. */
export function priceAnalyticsStaffRows(
  items: readonly PriceAnalyticsItem[],
  staff: ReadonlyMap<string, PriceAnalyticsStaffInfo>,
): PriceAnalyticsStaffRow[] {
  const groups = new Map<string | null, PriceAnalyticsItem[]>();
  for (const item of items) {
    const group = groups.get(item.staffId);
    if (group) group.push(item);
    else groups.set(item.staffId, [item]);
  }
  return [...groups.entries()]
    .map(([staffId, staffItems]) => {
      const totals = priceAnalyticsTotals(staffItems);
      const info = staffId === null ? undefined : staff.get(staffId);
      return {
        staffId,
        name:
          staffId === null
            ? null
            : (info?.name ?? staffItems.find((item) => item.staffName)?.staffName ?? ''),
        avatarUrl: info?.avatarUrl ?? null,
        bookingsCount: totals.bookingsCount,
        salesCount: totals.salesCount,
        regular: totals.regular,
        surcharges: totals.surcharges,
        discounts: totals.discounts,
        customDiscounts: staffItems
          .flatMap((item) => item.changes)
          .filter((change) => change.reason === PriceChangeReason.CUSTOM_PRICE_DOWN)
          .reduce((total, change) => total.plus(change.amount), ZERO),
        received: totals.received,
      };
    })
    .filter(
      (row) =>
        !row.regular.isZero() ||
        !row.surcharges.isZero() ||
        !row.discounts.isZero() ||
        !row.received.isZero(),
    )
    .sort(
      (a, b) =>
        b.received.comparedTo(a.received) ||
        (a.name ?? '￿').localeCompare(b.name ?? '￿', 'ru'),
    );
}

/**
 * Items of the list: with at least one change, with the filtered reason (and rule) when set;
 * the staff and type filters are applied by the loaders. Newest first, then by id.
 */
export function priceAnalyticsListItems(
  items: readonly PriceAnalyticsItem[],
  filter: Pick<PriceAnalyticsFilter, 'reason' | 'ruleId'>,
): PriceAnalyticsItem[] {
  return items
    .filter((item) =>
      filter.reason === undefined
        ? item.changes.length > 0
        : item.changes.some(
            (change) =>
              change.reason === filter.reason &&
              (filter.ruleId === undefined || change.ruleId === filter.ruleId),
          ),
    )
    .sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** Current rule names on the changes of the items; a deleted rule keeps its layer title. */
export function withRuleNames(
  items: readonly PriceAnalyticsItem[],
  rules: ReadonlyMap<string, PriceAnalyticsRuleInfo>,
): PriceAnalyticsItem[] {
  return items.map((item) => ({
    ...item,
    changes: item.changes.map((change) => {
      const rule =
        change.ruleId !== null && PRICE_ANALYTICS_RULE_REASONS.has(change.reason)
          ? rules.get(change.ruleId)
          : undefined;
      return rule ? { ...change, name: rule.name } : change;
    }),
  }));
}

/** Rule ids the changes of the items name. */
export function priceAnalyticsRuleIds(
  items: readonly PriceAnalyticsItem[],
): string[] {
  const ids = new Set<string>();
  for (const item of items)
    for (const change of item.changes)
      if (change.ruleId !== null && PRICE_ANALYTICS_RULE_REASONS.has(change.reason))
        ids.add(change.ruleId);
  return [...ids];
}

/**
 * The changes of an item for the export: `Выходные +15% +6,00; Осенний промокод −15% −6,90`.
 * A percent value has no trailing zeros, money has two decimals and a comma.
 */
export function priceAnalyticsChangesText(
  changes: readonly PriceAnalyticsChange[],
): string {
  return changes
    .map((change) => {
      const sign = isDiscount(change) ? MINUS : '+';
      const parts = [change.name];
      if (change.value !== null && change.valueType !== null)
        parts.push(
          change.valueType === PriceValueType.PERCENT
            ? `${sign}${number(change.value, false)}%`
            : `${sign}${number(change.value, true)}`,
        );
      parts.push(`${sign}${number(change.amount, true)}`);
      return parts.join(' ');
    })
    .join(PRICE_ANALYTICS_CHANGES_SEPARATOR);
}

function number(value: Prisma.Decimal, money: boolean): string {
  const text = money ? value.abs().toFixed(2) : value.abs().toString();
  return text.replace('.', ',');
}

function reasonKey(change: PriceAnalyticsChange): string {
  if (!PRICE_ANALYTICS_RULE_REASONS.has(change.reason)) return change.reason;
  return change.ruleId === null
    ? `${change.reason}:title:${change.name}`
    : `${change.reason}:${change.ruleId}`;
}

/** The layer title of a rule reason (a deleted rule); null for the reasons without a rule. */
function reasonName(change: PriceAnalyticsChange): string | null {
  return PRICE_ANALYTICS_RULE_REASONS.has(change.reason) ? change.name : null;
}

/** Tie-break order of rows with equal amounts: the name, or the label of the reason. */
function sortName(row: PriceAnalyticsReasonRow): string {
  switch (row.reason) {
    case PriceChangeReason.CLIENT_DISCOUNT:
    case PriceChangeReason.CUSTOM_PRICE_DOWN:
    case PriceChangeReason.CUSTOM_PRICE_UP:
      return row.name ?? PRICE_ANALYTICS_REASON_NAMES[row.reason];
    default:
      return row.name ?? '';
  }
}

function withShares(rows: PriceAnalyticsReasonRow[]): PriceAnalyticsReasonRow[] {
  const total = rows.reduce((sum, row) => sum.plus(row.amount), ZERO);
  return rows
    .map((row) => ({
      ...row,
      sharePct: total.isZero()
        ? 0
        : row.amount
            .mul(100)
            .div(total)
            .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
            .toNumber(),
    }))
    .sort(
      (a, b) =>
        b.amount.comparedTo(a.amount) ||
        sortName(a).localeCompare(sortName(b), 'ru'),
    );
}

function distinctCounts(items: readonly PriceAnalyticsItem[]): {
  bookingsCount: number;
  salesCount: number;
  clientsCount: number;
} {
  const bookings = new Set<string>();
  const sales = new Set<string>();
  const clients = new Set<string>();
  for (const item of items) {
    if (item.bookingId !== null) bookings.add(item.bookingId);
    if (item.source === PriceAnalyticsSource.SALE && item.orderId !== null)
      sales.add(item.orderId);
    if (item.clientId !== null) clients.add(item.clientId);
  }
  return {
    bookingsCount: bookings.size,
    salesCount: sales.size,
    clientsCount: clients.size,
  };
}
