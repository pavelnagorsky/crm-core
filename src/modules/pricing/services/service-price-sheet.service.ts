import { Injectable } from '@nestjs/common';
import { XlsxCells } from '../../../shared/xlsx/interfaces/xlsx-cells.interface.js';
import { XlsxGrid } from '../../../shared/xlsx/interfaces/xlsx-grid.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import {
  SERVICE_PRICE_IMPORT_MAX_ROWS,
  SERVICE_PRICE_SHEET_ALIASES,
  SERVICE_PRICE_SHEET_HEADERS,
  SERVICE_PRICE_SHEET_NAME,
  SERVICE_PRICE_SHEET_REQUIRED,
  SERVICE_PRICE_STAFF_ALIASES,
  SERVICE_PRICE_STAFF_HEADERS,
  SERVICE_PRICE_STAFF_REQUIRED,
  SERVICE_PRICE_STAFF_SHEET_NAME,
} from '../constants/service-price-import.constants.js';
import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import { ServicePriceStaffColumn } from '../enums/service-price-staff-column.enum.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { ServicePriceLevelColumn } from '../interfaces/service-price-level-column.interface.js';
import { ServicePriceSheetReadResult } from '../interfaces/service-price-sheet-read-result.interface.js';
import { ServicePriceSheetRow } from '../interfaces/service-price-sheet-row.interface.js';
import { ServicePriceStaffRow } from '../interfaces/service-price-staff-row.interface.js';
import { ServicePriceStaffSheet } from '../interfaces/service-price-staff-sheet.interface.js';
import { ServicePricesSheet } from '../interfaces/service-prices-sheet.interface.js';
import { normalizeName } from '../rules/service-price-import.rules.js';

const LEVEL_HEADER = /^цена\s*:\s*(.+)$/;

type Failure = Extract<ServicePriceSheetReadResult, { ok: false }>;

/** Reads the price file: the file checks, the headers and the cells, without looking at the catalog. */
@Injectable()
export class ServicePriceSheetService {
  async read(
    file: ServicePriceImportUpload | undefined,
  ): Promise<ServicePriceSheetReadResult> {
    if (!file || file.size === 0)
      return { ok: false, reason: ServicePriceImportFileReason.MISSING };
    if (!XlsxUtils.isXlsx(file))
      return {
        ok: false,
        reason: ServicePriceImportFileReason.UNSUPPORTED_TYPE,
      };

    const workbook = await XlsxUtils.readBook(file.buffer);
    if (!workbook)
      return { ok: false, reason: ServicePriceImportFileReason.CORRUPT };

    const pricesGrid =
      workbook.sheet(SERVICE_PRICE_SHEET_NAME) ?? workbook.first();
    if (!pricesGrid)
      return { ok: false, reason: ServicePriceImportFileReason.CORRUPT };
    const prices = this.readPrices(pricesGrid);
    if ('ok' in prices) return prices;

    const staffGrid = workbook.sheet(SERVICE_PRICE_STAFF_SHEET_NAME);
    const staff = staffGrid ? this.readStaff(staffGrid) : null;
    if (staff && 'ok' in staff) return staff;

    if (prices.rows.length === 0 && (!staff || staff.rows.length === 0))
      return { ok: false, reason: ServicePriceImportFileReason.EMPTY };
    return { ok: true, book: { prices, staff } };
  }

  private readPrices(grid: XlsxGrid): ServicePricesSheet | Failure {
    const columns: Partial<Record<ServicePriceSheetColumn, number>> = {};
    const headers = { ...SERVICE_PRICE_SHEET_HEADERS };
    const levelColumns: ServicePriceLevelColumn[] = [];
    const known = this.aliasMap(SERVICE_PRICE_SHEET_ALIASES);

    grid.row(1).each((text, index) => {
      const key = known.get(normalizeName(text));
      if (key) {
        if (columns[key] == null) {
          columns[key] = index;
          headers[key] = text;
        }
        return;
      }
      if (!text) return;
      const prefixed = LEVEL_HEADER.exec(normalizeName(text));
      const name = prefixed
        ? text.slice(text.indexOf(':') + 1).trim()
        : text.trim();
      levelColumns.push({ index, header: text, name, prefixed: !!prefixed });
    });

    const missing = SERVICE_PRICE_SHEET_REQUIRED.filter(
      (key) => columns[key] == null,
    );
    if (missing.length > 0)
      return {
        ok: false,
        reason: ServicePriceImportFileReason.MISSING_COLUMNS,
        sheet: ServicePriceImportSheet.PRICES,
        columns: missing.map((key) => SERVICE_PRICE_SHEET_HEADERS[key]),
      };

    const rows: ServicePriceSheetRow[] = [];
    for (let number = 2; number <= grid.rowCount; number += 1) {
      const cells = grid.row(number);
      const text = (key: ServicePriceSheetColumn) =>
        columns[key] == null ? '' : cells.text(columns[key]);
      const row: ServicePriceSheetRow = {
        row: number,
        id: text(ServicePriceSheetColumn.ID),
        category: text(ServicePriceSheetColumn.CATEGORY),
        type: text(ServicePriceSheetColumn.TYPE),
        title: text(ServicePriceSheetColumn.TITLE),
        duration: text(ServicePriceSheetColumn.DURATION),
        price: text(ServicePriceSheetColumn.PRICE),
        description: text(ServicePriceSheetColumn.DESCRIPTION),
        levels: levelColumns.map((column) => cells.text(column.index)),
      };
      if (this.isEmpty(row)) continue;
      rows.push(row);
      if (rows.length > SERVICE_PRICE_IMPORT_MAX_ROWS)
        return {
          ok: false,
          reason: ServicePriceImportFileReason.TOO_MANY_ROWS,
          sheet: ServicePriceImportSheet.PRICES,
        };
    }
    return { headers, levelColumns, rows };
  }

  private readStaff(grid: XlsxGrid): ServicePriceStaffSheet | Failure {
    const columns: Partial<Record<ServicePriceStaffColumn, number>> = {};
    const headers = { ...SERVICE_PRICE_STAFF_HEADERS };
    const known = this.aliasMap(SERVICE_PRICE_STAFF_ALIASES);
    this.eachHeader(grid.row(1), (text, index) => {
      const key = known.get(normalizeName(text));
      if (key && columns[key] == null) {
        columns[key] = index;
        headers[key] = text;
      }
    });

    const missing = SERVICE_PRICE_STAFF_REQUIRED.filter(
      (key) => columns[key] == null,
    );
    if (missing.length > 0)
      return {
        ok: false,
        reason: ServicePriceImportFileReason.MISSING_COLUMNS,
        sheet: ServicePriceImportSheet.STAFF_PRICES,
        columns: missing.map((key) => SERVICE_PRICE_STAFF_HEADERS[key]),
      };

    const rows: ServicePriceStaffRow[] = [];
    for (let number = 2; number <= grid.rowCount; number += 1) {
      const cells = grid.row(number);
      const text = (key: ServicePriceStaffColumn) =>
        columns[key] == null ? '' : cells.text(columns[key]);
      const row: ServicePriceStaffRow = {
        row: number,
        serviceId: text(ServicePriceStaffColumn.SERVICE_ID),
        staffId: text(ServicePriceStaffColumn.STAFF_ID),
        price: text(ServicePriceStaffColumn.PRICE),
      };
      // The columns "Услуга" and "Мастер" are for reading only, a row with just them is empty.
      if (!row.serviceId && !row.staffId && !row.price) continue;
      rows.push(row);
      if (rows.length > SERVICE_PRICE_IMPORT_MAX_ROWS)
        return {
          ok: false,
          reason: ServicePriceImportFileReason.TOO_MANY_ROWS,
          sheet: ServicePriceImportSheet.STAFF_PRICES,
        };
    }
    return {
      serviceIdHeader: headers[ServicePriceStaffColumn.SERVICE_ID],
      staffIdHeader: headers[ServicePriceStaffColumn.STAFF_ID],
      priceHeader: headers[ServicePriceStaffColumn.PRICE],
      rows,
    };
  }

  private eachHeader(
    cells: XlsxCells,
    visit: (text: string, index: number) => void,
  ): void {
    cells.each((text, index) => {
      if (text) visit(text, index);
    });
  }

  private aliasMap<K extends string>(
    aliases: Record<K, readonly string[]>,
  ): Map<string, K> {
    const map = new Map<string, K>();
    for (const key of Object.keys(aliases) as K[])
      for (const alias of aliases[key]) map.set(normalizeName(alias), key);
    return map;
  }

  private isEmpty(row: ServicePriceSheetRow): boolean {
    return (
      !row.id &&
      !row.category &&
      !row.type &&
      !row.title &&
      !row.duration &&
      !row.price &&
      !row.description &&
      row.levels.every((cell) => !cell)
    );
  }
}
