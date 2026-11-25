import { BundlePricingMode, PriceLevel } from '@prisma/client';
import {
  SERVICE_PRICE_LEVEL_HEADER_PREFIX,
  SERVICE_PRICE_SHEET_HEADERS,
  SERVICE_PRICE_STAFF_HEADERS,
  SERVICE_PRICE_TYPE_BUNDLE,
  SERVICE_PRICE_TYPE_SERVICE,
} from '../constants/service-price-import.constants.js';
import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import { ServicePriceStaffColumn } from '../enums/service-price-staff-column.enum.js';
import { ServicePriceExportInput } from '../interfaces/service-price-export-input.interface.js';
import { ServicePriceExportSheets } from '../interfaces/service-price-export-sheets.interface.js';

const ID_WIDTH = 38;

/** Header of the price column of a level. */
export const levelHeader = (level: Pick<PriceLevel, 'name'>): string =>
  `${SERVICE_PRICE_LEVEL_HEADER_PREFIX}${level.name}`;

const levelKey = (levelId: string): string => `level:${levelId}`;

/** The price as a Number cell with two decimals of precision. */
const cell = (price: { toFixed(places: number): string }): number =>
  Number(price.toFixed(2));

function priceColumns(levels: readonly PriceLevel[]) {
  const h = SERVICE_PRICE_SHEET_HEADERS;
  return [
    { header: h[ServicePriceSheetColumn.ID], key: 'id', width: ID_WIDTH },
    { header: h[ServicePriceSheetColumn.CATEGORY], key: 'category', width: 24 },
    { header: h[ServicePriceSheetColumn.TYPE], key: 'type', width: 12 },
    { header: h[ServicePriceSheetColumn.TITLE], key: 'title', width: 32 },
    {
      header: h[ServicePriceSheetColumn.DURATION],
      key: 'duration',
      width: 20,
    },
    { header: h[ServicePriceSheetColumn.PRICE], key: 'price', width: 14 },
    ...levels.map((level) => ({
      header: levelHeader(level),
      key: levelKey(level.id),
      width: 18,
    })),
    {
      header: h[ServicePriceSheetColumn.DESCRIPTION],
      key: 'description',
      width: 40,
    },
  ];
}

function staffColumns() {
  const h = SERVICE_PRICE_STAFF_HEADERS;
  return [
    {
      header: h[ServicePriceStaffColumn.SERVICE_ID],
      key: 'serviceId',
      width: ID_WIDTH,
    },
    { header: h[ServicePriceStaffColumn.SERVICE], key: 'service', width: 32 },
    {
      header: h[ServicePriceStaffColumn.STAFF_ID],
      key: 'staffId',
      width: ID_WIDTH,
    },
    { header: h[ServicePriceStaffColumn.STAFF], key: 'staff', width: 28 },
    { header: h[ServicePriceStaffColumn.PRICE], key: 'price', width: 14 },
  ];
}

/**
 * Both sheets of the price file for the current prices: services and FIXED bundles by category
 * order (bundles after the services of a category), then the personal prices of active staff.
 */
export function buildServicePriceExport(
  input: ServicePriceExportInput,
): ServicePriceExportSheets {
  const levels = input.levels.filter((level) => !level.isDefault);
  const categoryName = new Map(
    input.catalog.categories.map((category) => [category.id, category.name]),
  );
  const levelPrices = new Map(
    input.levelPrices.map((row) => [
      `${row.serviceId}:${row.priceLevelId}`,
      row.price,
    ]),
  );
  const bundles = input.catalog.bundles.filter(
    (bundle) =>
      bundle.pricingMode === BundlePricingMode.FIXED &&
      bundle.fixedPrice !== null,
  );

  const rows: Record<string, unknown>[] = [];
  const addGroup = (categoryId: string | null) => {
    for (const service of input.catalog.services) {
      if (service.categoryId !== categoryId) continue;
      const row: Record<string, unknown> = {
        id: service.id,
        category: categoryId ? (categoryName.get(categoryId) ?? '') : '',
        type: SERVICE_PRICE_TYPE_SERVICE,
        title: service.title,
        duration: service.durationMinutes,
        price: cell(service.price),
        description: service.description ?? '',
      };
      for (const level of levels) {
        const price = levelPrices.get(`${service.id}:${level.id}`);
        row[levelKey(level.id)] = price ? cell(price) : '';
      }
      rows.push(row);
    }
    for (const bundle of bundles) {
      if (bundle.categoryId !== categoryId || !bundle.fixedPrice) continue;
      rows.push({
        id: bundle.id,
        category: categoryId ? (categoryName.get(categoryId) ?? '') : '',
        type: SERVICE_PRICE_TYPE_BUNDLE,
        title: bundle.title,
        duration: '',
        price: cell(bundle.fixedPrice),
        description: '',
      });
    }
  };
  for (const category of input.catalog.categories) addGroup(category.id);
  addGroup(null);

  const titles = new Map(
    input.catalog.services.map((service) => [service.id, service.title]),
  );
  const staffRows = input.assignments.flatMap((assignment) => {
    const title = titles.get(assignment.serviceId);
    if (title === undefined) return [];
    return [
      {
        serviceId: assignment.serviceId,
        service: title,
        staffId: assignment.staffId,
        staff: assignment.staffName,
        price: assignment.price ? cell(assignment.price) : '',
      },
    ];
  });

  return {
    priceColumns: priceColumns(levels),
    priceRows: rows,
    staffColumns: staffColumns(),
    staffRows,
  };
}

/** The template: two sample services without ID and an empty personal price sheet. */
export function buildServicePriceTemplate(
  levels: readonly PriceLevel[],
): ServicePriceExportSheets {
  const own = levels.filter((level) => !level.isDefault);
  const first: Record<string, unknown> = {
    category: 'Стрижки',
    type: SERVICE_PRICE_TYPE_SERVICE,
    title: 'Женская стрижка',
    duration: 60,
    price: 50,
    description: '',
  };
  own.forEach((level, index) => {
    first[levelKey(level.id)] = 60 + index * 10;
  });
  const second: Record<string, unknown> = {
    category: 'Стрижки',
    type: SERVICE_PRICE_TYPE_SERVICE,
    title: 'Мужская стрижка',
    duration: 45,
    price: 35,
    description: 'Машинка и ножницы',
  };
  return {
    priceColumns: priceColumns(own),
    priceRows: [first, second],
    staffColumns: staffColumns(),
    staffRows: [],
  };
}
