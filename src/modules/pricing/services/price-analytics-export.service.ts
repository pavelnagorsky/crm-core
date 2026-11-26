import { Injectable } from '@nestjs/common';
import { XlsxColumn } from '../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import {
  PRICE_ANALYTICS_COLUMNS,
  PRICE_ANALYTICS_FILE,
  PRICE_ANALYTICS_SHEET,
} from '../constants/price-analytics.constants.js';
import { PriceAnalyticsExportData } from '../interfaces/price-analytics-export-data.interface.js';
import { PriceAnalyticsXlsxRow } from '../interfaces/price-analytics-xlsx-row.interface.js';
import { priceAnalyticsXlsxRows } from '../rules/price-analytics-export.rules.js';

const COLUMNS: XlsxColumn<PriceAnalyticsXlsxRow>[] = [
  { header: PRICE_ANALYTICS_COLUMNS.date, key: 'date', width: 12 },
  { header: PRICE_ANALYTICS_COLUMNS.time, key: 'time', width: 8 },
  { header: PRICE_ANALYTICS_COLUMNS.source, key: 'source', width: 18 },
  { header: PRICE_ANALYTICS_COLUMNS.client, key: 'client', width: 28 },
  { header: PRICE_ANALYTICS_COLUMNS.staff, key: 'staff', width: 24 },
  { header: PRICE_ANALYTICS_COLUMNS.title, key: 'title', width: 32 },
  { header: PRICE_ANALYTICS_COLUMNS.itemType, key: 'itemType', width: 10 },
  { header: PRICE_ANALYTICS_COLUMNS.quantity, key: 'quantity', width: 12 },
  { header: PRICE_ANALYTICS_COLUMNS.regular, key: 'regular', width: 14 },
  { header: PRICE_ANALYTICS_COLUMNS.surcharges, key: 'surcharges', width: 12 },
  { header: PRICE_ANALYTICS_COLUMNS.discounts, key: 'discounts', width: 12 },
  { header: PRICE_ANALYTICS_COLUMNS.received, key: 'received', width: 12 },
  { header: PRICE_ANALYTICS_COLUMNS.changes, key: 'changes', width: 48 },
];

/** Excel export of the discounts and surcharges items, the way the other exports build them. */
@Injectable()
export class PriceAnalyticsExportService {
  /** `skidki-i-natsenki-<from>-<to>.xlsx`, one sheet "Позиции". */
  items(data: PriceAnalyticsExportData): XlsxFile {
    const rows = priceAnalyticsXlsxRows(data);
    return XlsxUtils.write(
      `${PRICE_ANALYTICS_FILE}-${data.fromDay}-${data.toDay}.xlsx`,
      (book) => {
        const sheet = book.addSheet(PRICE_ANALYTICS_SHEET);
        sheet.setColumns(
          COLUMNS.map((column) => ({
            header: column.header,
            key: String(column.key),
            width: column.width,
          })),
        );
        for (const row of rows) sheet.addRow(row);
      },
    );
  }
}
