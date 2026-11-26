import { PriceChangeCatalog } from '@prisma/client';
import { XlsxBook } from '../../../shared/xlsx/interfaces/xlsx-book.interface.js';
import { XlsxWorkbook } from '../../../shared/xlsx/interfaces/xlsx-workbook.interface.js';
import {
  PRICE_EXPORT_FORMAT,
  PRICE_EXPORT_META,
  PRICE_EXPORT_SHEET_NAME,
} from '../constants/price-export-snapshot.constants.js';
import { PriceExportSnapshot } from '../interfaces/price-export-snapshot.interface.js';
import { parsePriceCell } from './price-cell.rules.js';

/** A money value as the snapshot stores it: "55.00", or null for an empty cell. */
export const snapshotPrice = (
  value: { toFixed(places: number): string } | null | undefined,
): string | null => (value == null ? null : value.toFixed(2));

/**
 * Writes the prices of an export to the very hidden sheet: two columns `key` and `value`, the
 * meta rows first (`@format`, `@catalog`, `@locationId`, `@exportedAt`), then one row per
 * price cell of the visible sheets.
 */
export function writePriceExportSnapshot(
  book: XlsxBook,
  snapshot: PriceExportSnapshot,
): void {
  const sheet = book.addHiddenSheet(PRICE_EXPORT_SHEET_NAME);
  sheet.addRow(['key', 'value']);
  sheet.addRow([PRICE_EXPORT_META.format, PRICE_EXPORT_FORMAT]);
  sheet.addRow([PRICE_EXPORT_META.catalog, snapshot.catalog]);
  sheet.addRow([PRICE_EXPORT_META.locationId, snapshot.locationId]);
  sheet.addRow([PRICE_EXPORT_META.exportedAt, snapshot.exportedAt]);
  for (const [key, value] of snapshot.values)
    sheet.addRow([key.toLowerCase(), value ?? '']);
}

/**
 * The export data of an uploaded file for the catalog. Null - the file has none (a new file,
 * the template, a copy into another workbook) or it was exported for another catalog: then
 * every filled price counts.
 */
export function readPriceExportSnapshot(
  workbook: XlsxWorkbook,
  catalog: PriceChangeCatalog,
): PriceExportSnapshot | null {
  const grid = workbook.sheet(PRICE_EXPORT_SHEET_NAME);
  if (!grid) return null;
  const meta = new Map<string, string>();
  const values = new Map<string, string | null>();
  for (let number = 2; number <= grid.rowCount; number += 1) {
    const cells = grid.row(number);
    const key = cells.text(1).toLowerCase();
    if (!key) continue;
    const value = cells.text(2);
    if (key.startsWith('@')) {
      meta.set(key, value);
      continue;
    }
    const price = parsePriceCell(value);
    if (price !== undefined) values.set(key, price);
  }
  const read = (name: keyof typeof PRICE_EXPORT_META) =>
    meta.get(PRICE_EXPORT_META[name].toLowerCase()) ?? '';
  if (read('format') !== PRICE_EXPORT_FORMAT || read('catalog') !== catalog)
    return null;
  return {
    catalog,
    locationId: read('locationId').toLowerCase(),
    exportedAt: read('exportedAt'),
    values,
  };
}

/** The export data if the file was exported for this location, else null (every filled price counts). */
export function snapshotForLocation(
  snapshot: PriceExportSnapshot | null,
  locationId: string,
): PriceExportSnapshot | null {
  return snapshot?.locationId === locationId.toLowerCase() ? snapshot : null;
}

/**
 * True when the cell still holds the value it was exported with: such a cell is not a change
 * and is ignored whatever the price on the date. A cell without export data (no snapshot, a
 * row or column added after the export) or with text that is not a price is not untouched.
 */
export function isUntouchedPrice(
  snapshot: PriceExportSnapshot | null,
  key: string,
  text: string,
): boolean {
  if (!snapshot) return false;
  const exported = snapshot.values.get(key.toLowerCase());
  if (exported === undefined) return false;
  const price = parsePriceCell(text);
  return price !== undefined && price === exported;
}
