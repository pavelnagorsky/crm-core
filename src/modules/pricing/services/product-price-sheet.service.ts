import { Injectable } from '@nestjs/common';
import { PriceChangeCatalog } from '@prisma/client';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import {
  PRODUCT_PRICE_IMPORT_MAX_ROWS,
  PRODUCT_PRICE_SHEET_ALIASES,
  PRODUCT_PRICE_SHEET_HEADERS,
  PRODUCT_PRICE_SHEET_NAME,
  PRODUCT_PRICE_SHEET_REQUIRED,
} from '../constants/product-price-import.constants.js';
import { ProductPriceSheetColumn } from '../enums/product-price-sheet-column.enum.js';
import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ProductPriceSheetReadResult } from '../interfaces/product-price-sheet-read-result.interface.js';
import { ProductPriceSheetRow } from '../interfaces/product-price-sheet-row.interface.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { readPriceExportSnapshot } from '../rules/price-export-snapshot.rules.js';
import { normalizeName } from '../rules/service-price-import.rules.js';

/**
 * Reads the product price file: the file checks, the headers (sheet "Цены", else the first
 * sheet) and the ID and price cells, without looking at the catalog. Only `ID` and `Цена`
 * are read; the other columns are for people.
 */
@Injectable()
export class ProductPriceSheetService {
  async read(
    file: ServicePriceImportUpload | undefined,
  ): Promise<ProductPriceSheetReadResult> {
    if (!file || file.size === 0)
      return { ok: false, reason: ServicePriceImportFileReason.MISSING };
    if (!XlsxUtils.isXlsx(file))
      return { ok: false, reason: ServicePriceImportFileReason.UNSUPPORTED_TYPE };
    const workbook = await XlsxUtils.readBook(file.buffer);
    const grid = workbook
      ? (workbook.sheet(PRODUCT_PRICE_SHEET_NAME) ?? workbook.first())
      : null;
    if (!workbook || !grid) return { ok: false, reason: ServicePriceImportFileReason.CORRUPT };

    const known = new Map<string, ProductPriceSheetColumn>();
    for (const key of Object.values(ProductPriceSheetColumn))
      for (const alias of PRODUCT_PRICE_SHEET_ALIASES[key])
        known.set(normalizeName(alias), key);
    const columns: Partial<Record<ProductPriceSheetColumn, number>> = {};
    const headers = { ...PRODUCT_PRICE_SHEET_HEADERS };
    grid.row(1).each((text, index) => {
      const key = known.get(normalizeName(text));
      if (key && columns[key] == null) {
        columns[key] = index;
        headers[key] = text;
      }
    });
    const missing = PRODUCT_PRICE_SHEET_REQUIRED.filter(
      (key) => columns[key] == null,
    );
    if (missing.length > 0)
      return {
        ok: false,
        reason: ServicePriceImportFileReason.MISSING_COLUMNS,
        columns: missing.map((key) => PRODUCT_PRICE_SHEET_HEADERS[key]),
      };

    const idColumn = columns[ProductPriceSheetColumn.ID]!;
    const priceColumn = columns[ProductPriceSheetColumn.PRICE]!;
    const rows: ProductPriceSheetRow[] = [];
    for (let number = 2; number <= grid.rowCount; number += 1) {
      const cells = grid.row(number);
      const row = {
        row: number,
        id: cells.text(idColumn),
        price: cells.text(priceColumn),
      };
      // The other columns are for reading only: a row without ID and price is empty.
      if (!row.id && !row.price) continue;
      rows.push(row);
      if (rows.length > PRODUCT_PRICE_IMPORT_MAX_ROWS)
        return { ok: false, reason: ServicePriceImportFileReason.TOO_MANY_ROWS };
    }
    if (rows.length === 0)
      return { ok: false, reason: ServicePriceImportFileReason.EMPTY };
    return {
      ok: true,
      sheet: {
        idHeader: headers[ProductPriceSheetColumn.ID],
        priceHeader: headers[ProductPriceSheetColumn.PRICE],
        rows,
        snapshot: readPriceExportSnapshot(workbook, PriceChangeCatalog.PRODUCTS),
      },
    };
  }
}
