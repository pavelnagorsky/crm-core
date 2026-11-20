import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { TrafficSourceViews } from '../../booking-traffic/interfaces/traffic-source-views.interface.js';
import { TrafficSourceTotals } from '../../bookings/interfaces/traffic-source-totals.interface.js';
import { TrafficSourceTotalsRow } from '../../bookings/interfaces/traffic-source-totals-row.interface.js';
import {
  TRAFFIC_OTHER_DETAILS_ID,
  TRAFFIC_SOURCE_NONE_ID,
  TRAFFIC_TOP_DETAILS,
} from '../constants/traffic-source-widget.constants.js';
import { WidgetBreakdownDto } from '../dto/widget-breakdown.dto.js';
import { WidgetTableColumnDto } from '../dto/widget-table-column.dto.js';
import { WidgetTableRowDto } from '../dto/widget-table-row.dto.js';
import { WidgetTableDto } from '../dto/widget-table.dto.js';
import { MetricUnit } from '../enums/metric-unit.enum.js';
import { TrafficSourceLabels } from '../interfaces/traffic-source-labels.interface.js';
import { pct } from './dashboard-metrics.js';

export const TRAFFIC_SOURCE_TABLE_COLUMNS: WidgetTableColumnDto[] = [
  { key: 'views', unit: MetricUnit.COUNT },
  { key: 'formOpens', unit: MetricUnit.COUNT },
  { key: 'bookings', unit: MetricUnit.COUNT },
  { key: 'newClients', unit: MetricUnit.COUNT },
  { key: 'completedVisits', unit: MetricUnit.COUNT },
  { key: 'completedRevenue', unit: MetricUnit.CURRENCY },
  { key: 'conversionPct', unit: MetricUnit.PERCENT },
];

export function trafficSourceId(source: TrafficSource | null): string {
  return source ?? TRAFFIC_SOURCE_NONE_ID;
}

/** Bars of bookings per source: value is bookings, secondaryValue new clients. */
export function trafficSourceBreakdown(
  totals: TrafficSourceTotals,
  labels: TrafficSourceLabels,
): WidgetBreakdownDto {
  const total = totals.total.bookings;
  const items = totals.sources
    .map((row) => {
      const id = trafficSourceId(row.source);
      return {
        id,
        label: labels.sources[id] ?? id,
        value: row.bookings,
        secondaryValue: row.newClients,
        sharePct: pct(row.bookings, total),
      };
    })
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  return { dimension: 'trafficSource', items, total };
}

/**
 * The sources table: one row per source with views and form opens of the booking pages and
 * widgets (null when views are not known, e.g. under a staff filter), bookings and their
 * outcomes, and conversion = page and widget bookings / views. Under each source its top details
 * by bookings and one row summing the rest; detail rows have no views.
 */
export function trafficSourceTable(
  totals: TrafficSourceTotals,
  views: TrafficSourceViews[] | null,
  labels: TrafficSourceLabels,
): WidgetTableDto {
  const viewsBySource = new Map(views?.map((row) => [row.source, row]) ?? []);
  const bookingsBySource = new Map(
    totals.sources.map((row) => [trafficSourceId(row.source), row]),
  );
  const ids = new Set<string>([
    ...bookingsBySource.keys(),
    ...(views ?? [])
      .filter((row) => row.views > 0 || row.formOpens > 0)
      .map((row) => row.source),
  ]);
  const parents = [...ids].map((id) => {
    const booked = bookingsBySource.get(id);
    const seen = views
      ? (viewsBySource.get(id as TrafficSource) ?? {
          views: 0,
          formOpens: 0,
        })
      : null;
    return {
      id,
      bookings: booked?.bookings ?? 0,
      views: seen?.views ?? null,
      row: tableRow(id, null, labels.sources[id] ?? id, booked, seen),
    };
  });
  parents.sort(
    (a, b) =>
      b.bookings - a.bookings ||
      (b.views ?? 0) - (a.views ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const rows: WidgetTableRowDto[] = [];
  for (const parent of parents) {
    rows.push(parent.row);
    rows.push(...detailRows(parent.id, totals.details, labels));
  }
  const totalViews = views
    ? views.reduce(
        (sum, row) => ({
          views: sum.views + row.views,
          formOpens: sum.formOpens + row.formOpens,
        }),
        { views: 0, formOpens: 0 },
      )
    : null;
  return {
    dimension: 'trafficSource',
    columns: TRAFFIC_SOURCE_TABLE_COLUMNS,
    rows,
    totals: tableValues(totals.total, totalViews),
  };
}

function detailRows(
  parentId: string,
  details: TrafficSourceTotalsRow[],
  labels: TrafficSourceLabels,
): WidgetTableRowDto[] {
  const own = details
    .filter((row) => trafficSourceId(row.source) === parentId)
    .sort(
      (a, b) =>
        b.bookings - a.bookings ||
        (a.detail ?? '').localeCompare(b.detail ?? ''),
    );
  const rows = own
    .slice(0, TRAFFIC_TOP_DETAILS)
    .map((row) =>
      tableRow(
        `${parentId}:${row.detail}`,
        parentId,
        row.detail ?? '',
        row,
        null,
      ),
    );
  const rest = own.slice(TRAFFIC_TOP_DETAILS);
  if (rest.length)
    rows.push(
      tableRow(
        `${parentId}:${TRAFFIC_OTHER_DETAILS_ID}`,
        parentId,
        labels.otherDetails,
        sumRows(rest),
        null,
      ),
    );
  return rows;
}

function tableRow(
  id: string,
  parentId: string | null,
  label: string,
  booked: TrafficSourceTotalsRow | undefined,
  seen: { views: number; formOpens: number } | null,
): WidgetTableRowDto {
  return { id, parentId, label, values: tableValues(booked, seen) };
}

function tableValues(
  booked: TrafficSourceTotalsRow | undefined,
  seen: { views: number; formOpens: number } | null,
): Record<string, number | null> {
  const channelBookings = booked?.channelBookings ?? 0;
  return {
    views: seen?.views ?? null,
    formOpens: seen?.formOpens ?? null,
    bookings: booked?.bookings ?? 0,
    newClients: booked?.newClients ?? 0,
    completedVisits: booked?.completedVisits ?? 0,
    completedRevenue: Number(
      MoneyUtils.format(booked?.completedRevenue ?? MoneyUtils.decimal(0)),
    ),
    conversionPct:
      seen && seen.views > 0 ? pct(channelBookings, seen.views) : null,
  };
}

function sumRows(rows: TrafficSourceTotalsRow[]): TrafficSourceTotalsRow {
  return rows.reduce<TrafficSourceTotalsRow>(
    (sum, row) => ({
      ...sum,
      bookings: sum.bookings + row.bookings,
      channelBookings: sum.channelBookings + row.channelBookings,
      newClients: sum.newClients + row.newClients,
      completedVisits: sum.completedVisits + row.completedVisits,
      completedRevenue: sum.completedRevenue.plus(row.completedRevenue),
    }),
    {
      source: rows[0]?.source ?? null,
      detail: null,
      bookings: 0,
      channelBookings: 0,
      newClients: 0,
      completedVisits: 0,
      completedRevenue: new Prisma.Decimal(0),
    },
  );
}
