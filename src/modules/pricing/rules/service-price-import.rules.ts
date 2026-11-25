import { ServicePriceImportItemType } from '../enums/service-price-import-item-type.enum.js';
import { ServicePriceImportRowError } from '../enums/service-price-import-row-error.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import {
  SERVICE_PRICE_CATEGORY_MAX,
  SERVICE_PRICE_DESCRIPTION_MAX,
  SERVICE_PRICE_DURATION_MAX,
  SERVICE_PRICE_MAX_UNITS,
  SERVICE_PRICE_TITLE_MAX,
} from '../constants/service-price-import.constants.js';
import { ServicePriceBook } from '../interfaces/service-price-book.interface.js';
import { ServicePriceEdit } from '../interfaces/service-price-edit.interface.js';
import { ServicePriceImportCatalog } from '../interfaces/service-price-import-catalog.interface.js';
import { ServicePriceImportErrorEntry } from '../interfaces/service-price-import-error-entry.interface.js';
import { ServicePriceImportPlan } from '../interfaces/service-price-import-plan.interface.js';
import { ServicePriceNewService } from '../interfaces/service-price-new-service.interface.js';
import { ServicePriceSheetRow } from '../interfaces/service-price-sheet-row.interface.js';
import { ServicePriceStaffEdit } from '../interfaces/service-price-staff-edit.interface.js';

const SPACES = /[\s ]+/g;
const PRICE_TEXT = /^\d+(\.\d+)?$/;
const DURATION_TEXT = /^\d+(\.0+)?$/;
const BUNDLE_TYPES = new Set(['комплекс', 'bundle']);
const NOISE = 1e-6;

type LevelRef = { levelId: string; levelName: string } | null;

type Fail = (
  column: ServicePriceSheetColumn | string,
  code: ServicePriceImportRowError,
) => void;

/** Lower case, `ё` as `е`, single inner spaces: how headers, categories and titles are compared. */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(SPACES, ' ');
}

/** Key of a service for the duplicate check: category and title, without case and extra spaces. */
export function serviceKey(category: string | null, title: string): string {
  return `${normalizeName(category ?? '')}|${normalizeName(title)}`;
}

/**
 * A price cell: `55`, `55.5`, `55,50`, `1 200`. Null for an empty cell, undefined for text that is
 * not a price (not a number, negative, over two decimals, over the maximum). Binary noise of a
 * spreadsheet number (55.00000000000001) is rounded away.
 */
export function parsePriceCell(text: string): string | null | undefined {
  const cleaned = text.replace(SPACES, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!PRICE_TEXT.test(cleaned)) return undefined;
  const [units, fraction = ''] = cleaned.split('.');
  let canonicalUnits = units.replace(/^0+(?=\d)/, '');
  let canonicalFraction = fraction;
  if (fraction.length > 2) {
    const scaled = Number(cleaned) * 100;
    if (Math.abs(scaled - Math.round(scaled)) > NOISE) return undefined;
    const rounded = (Math.round(scaled) / 100).toFixed(2);
    [canonicalUnits, canonicalFraction] = rounded.split('.');
  }
  if (Number(canonicalUnits) > SERVICE_PRICE_MAX_UNITS) return undefined;
  return `${canonicalUnits}.${canonicalFraction.padEnd(2, '0')}`;
}

/** Whole minutes 1-1440; null for an empty cell, undefined for anything else. */
export function parseDurationCell(text: string): number | null | undefined {
  const cleaned = text.replace(SPACES, '');
  if (cleaned === '') return null;
  if (!DURATION_TEXT.test(cleaned)) return undefined;
  const minutes = Number(cleaned);
  return minutes >= 1 && minutes <= SERVICE_PRICE_DURATION_MAX
    ? minutes
    : undefined;
}

/** Checks every row of the file and splits it into new services, price edits and errors. */
export function planServicePriceImport(
  book: ServicePriceBook,
  catalog: ServicePriceImportCatalog,
): ServicePriceImportPlan {
  const errors: ServicePriceImportErrorEntry[] = [];
  const levelRefs = resolveLevelColumns(book, catalog, errors);

  const edits: ServicePriceEdit[] = [];
  const newServices: ServicePriceNewService[] = [];
  const newCategories = new Map<string, string>();
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  for (const row of book.prices.rows) {
    const fail: Fail = (column, code) => {
      errors.push({
        sheet: ServicePriceImportSheet.PRICES,
        row: row.row,
        column: isSheetColumn(column) ? book.prices.headers[column] : column,
        code,
      });
    };
    if (row.id) {
      const edit = planEdit(row, book, catalog, levelRefs, seenIds, fail);
      if (edit) edits.push(edit);
      continue;
    }
    const created = planNewService(
      row,
      book,
      catalog,
      levelRefs,
      seenKeys,
      newCategories,
      fail,
    );
    if (created) newServices.push(created);
  }

  return {
    newServices,
    newCategories: [...newCategories.values()],
    edits,
    staffEdits: planStaffEdits(book, catalog, errors),
    errors,
  };
}

function isSheetColumn(value: string): value is ServicePriceSheetColumn {
  return Object.values<string>(ServicePriceSheetColumn).includes(value);
}

/** Level columns by header; a "Цена: X" header with no such level is an error of row 1. */
function resolveLevelColumns(
  book: ServicePriceBook,
  catalog: ServicePriceImportCatalog,
  errors: ServicePriceImportErrorEntry[],
): LevelRef[] {
  const byName = new Map(
    catalog.levels.map((level) => [normalizeName(level.name), level]),
  );
  return book.prices.levelColumns.map((column) => {
    const level = byName.get(normalizeName(column.name));
    if (level && !level.isDefault)
      return { levelId: level.id, levelName: level.name };
    if (!level && column.prefixed)
      errors.push({
        sheet: ServicePriceImportSheet.PRICES,
        row: 1,
        column: column.header,
        code: ServicePriceImportRowError.UNKNOWN_LEVEL_COLUMN,
      });
    return null;
  });
}

function planEdit(
  row: ServicePriceSheetRow,
  book: ServicePriceBook,
  catalog: ServicePriceImportCatalog,
  levelRefs: readonly LevelRef[],
  seenIds: Set<string>,
  fail: Fail,
): ServicePriceEdit | null {
  const id = row.id.toLowerCase();
  const item = catalog.items.get(id);
  if (seenIds.has(id)) {
    fail(ServicePriceSheetColumn.ID, ServicePriceImportRowError.DUPLICATE_ID);
    return null;
  }
  seenIds.add(id);
  if (!item) {
    fail(ServicePriceSheetColumn.ID, ServicePriceImportRowError.ID_NOT_FOUND);
    return null;
  }
  const isBundle = item.type === ServicePriceImportItemType.BUNDLE;
  if (isBundle && !item.fixed) {
    fail(
      ServicePriceSheetColumn.ID,
      ServicePriceImportRowError.BUNDLE_NOT_FIXED,
    );
    return null;
  }

  let failed = false;
  const basePrice = parsePriceCell(row.price);
  if (basePrice === undefined) {
    fail(
      ServicePriceSheetColumn.PRICE,
      ServicePriceImportRowError.PRICE_INVALID,
    );
    failed = true;
  }
  const levelPrices: ServicePriceEdit['levelPrices'] = [];
  if (!isBundle) {
    book.prices.levelColumns.forEach((column, index) => {
      const level = levelRefs[index];
      if (!level) return;
      const price = parsePriceCell(row.levels[index] ?? '');
      if (price === undefined) {
        fail(column.header, ServicePriceImportRowError.PRICE_INVALID);
        failed = true;
        return;
      }
      levelPrices.push({ levelId: level.levelId, price });
    });
  }
  if (failed) return null;
  return {
    row: row.row,
    type: item.type,
    id,
    basePrice: basePrice ?? null,
    levelPrices,
  };
}

function planNewService(
  row: ServicePriceSheetRow,
  book: ServicePriceBook,
  catalog: ServicePriceImportCatalog,
  levelRefs: readonly LevelRef[],
  seenKeys: Set<string>,
  newCategories: Map<string, string>,
  fail: Fail,
): ServicePriceNewService | null {
  let failed = false;
  const reject: Fail = (column, code) => {
    fail(column, code);
    failed = true;
  };

  if (BUNDLE_TYPES.has(normalizeName(row.type)))
    reject(
      ServicePriceSheetColumn.TYPE,
      ServicePriceImportRowError.BUNDLE_CREATE_UNSUPPORTED,
    );

  const title = row.title.trim();
  if (!title)
    reject(
      ServicePriceSheetColumn.TITLE,
      ServicePriceImportRowError.NAME_REQUIRED,
    );
  else if (Array.from(title).length > SERVICE_PRICE_TITLE_MAX)
    reject(
      ServicePriceSheetColumn.TITLE,
      ServicePriceImportRowError.NAME_TOO_LONG,
    );

  const durationMinutes = parseDurationCell(row.duration);
  if (durationMinutes === null)
    reject(
      ServicePriceSheetColumn.DURATION,
      ServicePriceImportRowError.DURATION_REQUIRED,
    );
  else if (durationMinutes === undefined)
    reject(
      ServicePriceSheetColumn.DURATION,
      ServicePriceImportRowError.DURATION_INVALID,
    );

  const price = parsePriceCell(row.price);
  if (price === null)
    reject(
      ServicePriceSheetColumn.PRICE,
      ServicePriceImportRowError.PRICE_REQUIRED,
    );
  else if (price === undefined)
    reject(
      ServicePriceSheetColumn.PRICE,
      ServicePriceImportRowError.PRICE_INVALID,
    );

  const category = row.category.trim().replace(SPACES, ' ');
  if (Array.from(category).length > SERVICE_PRICE_CATEGORY_MAX)
    reject(
      ServicePriceSheetColumn.CATEGORY,
      ServicePriceImportRowError.CATEGORY_TOO_LONG,
    );

  const description = row.description.trim();
  if (Array.from(description).length > SERVICE_PRICE_DESCRIPTION_MAX)
    reject(
      ServicePriceSheetColumn.DESCRIPTION,
      ServicePriceImportRowError.DESCRIPTION_TOO_LONG,
    );

  const levelPrices: ServicePriceNewService['levelPrices'] = [];
  book.prices.levelColumns.forEach((column, index) => {
    const level = levelRefs[index];
    if (!level) return;
    const levelPrice = parsePriceCell(row.levels[index] ?? '');
    if (levelPrice === undefined)
      reject(column.header, ServicePriceImportRowError.PRICE_INVALID);
    else if (levelPrice !== null)
      levelPrices.push({ ...level, price: levelPrice });
  });

  if (title && !failed) {
    const key = serviceKey(category || null, title);
    if (catalog.serviceKeys.has(key) || seenKeys.has(key))
      reject(
        ServicePriceSheetColumn.TITLE,
        ServicePriceImportRowError.DUPLICATE_SERVICE,
      );
    seenKeys.add(key);
  }
  if (failed || durationMinutes == null || price == null) return null;

  const categoryKey = normalizeName(category);
  const existingName = category ? catalog.categories.get(categoryKey) : null;
  if (category && !existingName && !newCategories.has(categoryKey))
    newCategories.set(categoryKey, category);
  return {
    row: row.row,
    categoryName: category
      ? (existingName ?? newCategories.get(categoryKey) ?? category)
      : null,
    categoryWillBeCreated: Boolean(category && !existingName),
    title,
    durationMinutes,
    price,
    description: description || null,
    levelPrices,
  };
}

function planStaffEdits(
  book: ServicePriceBook,
  catalog: ServicePriceImportCatalog,
  errors: ServicePriceImportErrorEntry[],
): ServicePriceStaffEdit[] {
  const sheet = book.staff;
  if (!sheet) return [];
  const edits: ServicePriceStaffEdit[] = [];
  const seen = new Set<string>();
  for (const row of sheet.rows) {
    let failed = false;
    const reject = (column: string, code: ServicePriceImportRowError) => {
      errors.push({
        sheet: ServicePriceImportSheet.STAFF_PRICES,
        row: row.row,
        column,
        code,
      });
      failed = true;
    };
    const serviceId = row.serviceId.toLowerCase();
    const staffId = row.staffId.toLowerCase();
    const item = catalog.items.get(serviceId);
    if (!item || item.type !== ServicePriceImportItemType.SERVICE)
      reject(
        sheet.serviceIdHeader,
        ServicePriceImportRowError.SERVICE_NOT_FOUND,
      );
    if (!catalog.staffIds.has(staffId))
      reject(sheet.staffIdHeader, ServicePriceImportRowError.STAFF_NOT_FOUND);
    else if (!failed && !catalog.assignments.has(`${staffId}:${serviceId}`))
      reject(
        sheet.staffIdHeader,
        ServicePriceImportRowError.STAFF_NOT_ASSIGNED,
      );
    const price = parsePriceCell(row.price);
    if (price === undefined)
      reject(sheet.priceHeader, ServicePriceImportRowError.PRICE_INVALID);
    if (!failed) {
      const pair = `${staffId}:${serviceId}`;
      if (seen.has(pair))
        reject(
          sheet.staffIdHeader,
          ServicePriceImportRowError.DUPLICATE_STAFF_PRICE,
        );
      seen.add(pair);
    }
    if (!failed)
      edits.push({ row: row.row, serviceId, staffId, price: price ?? null });
  }
  return edits;
}
