import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import { ServicePriceStaffColumn } from '../enums/service-price-staff-column.enum.js';

export const SERVICE_PRICE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** Per sheet. */
export const SERVICE_PRICE_IMPORT_MAX_ROWS = 2000;
export const SERVICE_PRICE_IMPORT_MAX_LISTED_ERRORS = 200;

export const SERVICE_PRICE_SHEET_NAME = 'Цены';
export const SERVICE_PRICE_STAFF_SHEET_NAME = 'Личные цены';
export const SERVICE_PRICE_FILE_PREFIX = 'prices';
export const SERVICE_PRICE_TEMPLATE_FILE = 'prices-template.xlsx';

export const SERVICE_PRICE_LEVEL_HEADER_PREFIX = 'Цена: ';
export const SERVICE_PRICE_TYPE_SERVICE = 'Услуга';
export const SERVICE_PRICE_TYPE_BUNDLE = 'Комплекс';

export const SERVICE_PRICE_TITLE_MAX = 150;
export const SERVICE_PRICE_DESCRIPTION_MAX = 2000;
export const SERVICE_PRICE_CATEGORY_MAX = 255;
export const SERVICE_PRICE_DURATION_MAX = 1440;
/** Decimal(10, 2). */
export const SERVICE_PRICE_MAX_UNITS = 99999999;

export const SERVICE_PRICE_SHEET_HEADERS: Record<
  ServicePriceSheetColumn,
  string
> = {
  [ServicePriceSheetColumn.ID]: 'ID',
  [ServicePriceSheetColumn.CATEGORY]: 'Категория',
  [ServicePriceSheetColumn.TYPE]: 'Тип',
  [ServicePriceSheetColumn.TITLE]: 'Название',
  [ServicePriceSheetColumn.DURATION]: 'Длительность (мин)',
  [ServicePriceSheetColumn.PRICE]: 'Базовая цена',
  [ServicePriceSheetColumn.DESCRIPTION]: 'Описание',
};

export const SERVICE_PRICE_STAFF_HEADERS: Record<
  ServicePriceStaffColumn,
  string
> = {
  [ServicePriceStaffColumn.SERVICE_ID]: 'ID услуги',
  [ServicePriceStaffColumn.SERVICE]: 'Услуга',
  [ServicePriceStaffColumn.STAFF_ID]: 'ID мастера',
  [ServicePriceStaffColumn.STAFF]: 'Мастер',
  [ServicePriceStaffColumn.PRICE]: 'Цена',
};

/** Header synonyms; compared in normalized form (see `normalizeHeader`). */
export const SERVICE_PRICE_SHEET_ALIASES: Record<
  ServicePriceSheetColumn,
  readonly string[]
> = {
  [ServicePriceSheetColumn.ID]: ['id', 'ид'],
  [ServicePriceSheetColumn.CATEGORY]: ['категория', 'category'],
  [ServicePriceSheetColumn.TYPE]: ['тип', 'type', 'вид'],
  [ServicePriceSheetColumn.TITLE]: [
    'название',
    'название услуги',
    'услуга',
    'name',
    'title',
  ],
  [ServicePriceSheetColumn.DURATION]: [
    'длительность (мин)',
    'длительность',
    'длительность, мин',
    'duration',
  ],
  [ServicePriceSheetColumn.PRICE]: [
    'базовая цена',
    'цена',
    'price',
    'base price',
  ],
  [ServicePriceSheetColumn.DESCRIPTION]: ['описание', 'description'],
};

export const SERVICE_PRICE_STAFF_ALIASES: Record<
  ServicePriceStaffColumn,
  readonly string[]
> = {
  [ServicePriceStaffColumn.SERVICE_ID]: ['id услуги', 'service id'],
  [ServicePriceStaffColumn.SERVICE]: ['услуга', 'service'],
  [ServicePriceStaffColumn.STAFF_ID]: [
    'id мастера',
    'staff id',
    'id сотрудника',
  ],
  [ServicePriceStaffColumn.STAFF]: ['мастер', 'сотрудник', 'staff'],
  [ServicePriceStaffColumn.PRICE]: ['цена', 'price'],
};

export const SERVICE_PRICE_SHEET_REQUIRED: readonly ServicePriceSheetColumn[] = [
  ServicePriceSheetColumn.ID,
  ServicePriceSheetColumn.TITLE,
  ServicePriceSheetColumn.PRICE,
];

export const SERVICE_PRICE_STAFF_REQUIRED: readonly ServicePriceStaffColumn[] = [
  ServicePriceStaffColumn.SERVICE_ID,
  ServicePriceStaffColumn.STAFF_ID,
  ServicePriceStaffColumn.PRICE,
];
