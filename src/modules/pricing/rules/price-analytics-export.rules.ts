import { Prisma } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import {
  PRICE_ANALYTICS_ITEM_TYPE_LABELS,
  PRICE_ANALYTICS_SOURCE_LABELS,
  PRICE_ANALYTICS_TOTAL_LABEL,
} from '../constants/price-analytics.constants.js';
import { PriceAnalyticsExportData } from '../interfaces/price-analytics-export-data.interface.js';
import { PriceAnalyticsXlsxRow } from '../interfaces/price-analytics-xlsx-row.interface.js';
import { priceAnalyticsChangesText } from './price-analytics-report.rules.js';

const money = (value: Prisma.Decimal): number => Number(value.toFixed(2));

/**
 * Rows of the items export (docs/pricing-stage8-api.md, «Выгрузка»): date and time in the
 * location zone, no phones, the changes as text, a last "Итого" row with the sums.
 */
export function priceAnalyticsXlsxRows(
  data: PriceAnalyticsExportData,
): PriceAnalyticsXlsxRow[] {
  const rows = data.items.map((item): PriceAnalyticsXlsxRow => {
    const [date, time] = TimeUtils.zonedDateTimeStr(item.at, data.timezone).split(' ');
    return {
      date,
      time,
      source: PRICE_ANALYTICS_SOURCE_LABELS[item.source],
      client: item.clientName ?? '',
      staff: item.staffName ?? '',
      title: item.title,
      itemType: PRICE_ANALYTICS_ITEM_TYPE_LABELS[item.itemType],
      quantity: item.quantity === null ? '' : Number(item.quantity.toFixed(3)),
      regular: money(item.regular),
      surcharges: money(item.surcharges),
      discounts: money(item.discounts),
      received: money(item.received),
      changes: priceAnalyticsChangesText(item.changes),
    };
  });
  rows.push({
    date: PRICE_ANALYTICS_TOTAL_LABEL,
    time: '',
    source: '',
    client: '',
    staff: '',
    title: '',
    itemType: '',
    quantity: '',
    regular: money(data.totals.regular),
    surcharges: money(data.totals.surcharges),
    discounts: money(data.totals.discounts),
    received: money(data.totals.received),
    changes: '',
  });
  return rows;
}
