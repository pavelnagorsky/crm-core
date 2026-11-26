import ExcelJS from 'exceljs';
import {
  BundlePricingMode,
  Prisma,
  ProductStatus,
  ProductUnit,
  ServiceStatus,
} from '@prisma/client';
import { PassThrough } from 'stream';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { PRICE_EXPORT_SHEET_NAME } from '../constants/price-export-snapshot.constants.js';
import { PriceChangeTarget } from '../engine/enums/price-change-target.enum.js';
import { PricingPriceChangeItem } from '../engine/interfaces/pricing-price-change-item.interface.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ServicePriceBook } from '../interfaces/service-price-book.interface.js';
import { ServicePriceImportFacts } from '../interfaces/service-price-import-facts.interface.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { snapshotForLocation } from '../rules/price-export-snapshot.rules.js';
import {
  buildProductImportRows,
  planProductPriceImport,
} from '../rules/product-price-import.rules.js';
import {
  buildImportCatalog,
  buildImportChange,
} from '../rules/service-price-import-change.rules.js';
import { planServicePriceImport } from '../rules/service-price-import.rules.js';
import { ProductPriceExportService } from './product-price-export.service.js';
import { ProductPriceSheetService } from './product-price-sheet.service.js';
import { ServicePriceExportService } from './service-price-export.service.js';
import { ServicePriceSheetService } from './service-price-sheet.service.js';

const LOCATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const B1 = '33333333-3333-4333-8333-333333333333';
const M1 = '44444444-4444-4444-8444-444444444444';
const TOP = '55555555-5555-4555-8555-555555555555';
const PA = '66666666-6666-4666-8666-666666666666';
const PB = '77777777-7777-4777-8777-777777777777';

const PLANNED = '2026-12-20';
const UPLOAD_DATE = '2027-01-01';

const d = (value: string) => new Prisma.Decimal(value);

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0],
  );
  return workbook;
}

/** Sets cells of the sheet by row ID and header, the way a person edits the file in Excel. */
async function edit(
  buffer: Buffer,
  sheet: string,
  cells: { id: string; header: string; value: number | string }[],
): Promise<ServicePriceImportUpload> {
  const workbook = await load(buffer);
  const worksheet = workbook.getWorksheet(sheet)!;
  const headers = worksheet.getRow(1).values as unknown[];
  for (const cell of cells) {
    const column = headers.indexOf(cell.header);
    worksheet.eachRow((row) => {
      if (row.getCell(1).value === cell.id) row.getCell(column).value = cell.value;
    });
  }
  const edited = Buffer.from(await workbook.xlsx.writeBuffer());
  return upload(edited);
}

const upload = (buffer: Buffer): ServicePriceImportUpload => ({
  buffer,
  size: buffer.length,
  originalname: 'prices.xlsx',
  mimetype: XlsxUtils.mimeType,
});

const fileBuffer = async (file: XlsxFile | Promise<XlsxFile>) =>
  collect((await file).stream);

const item = (
  target: PriceChangeTarget,
  ids: Partial<PricingPriceChangeItem>,
  price: number | null,
): PricingPriceChangeItem => ({
  target,
  serviceId: null,
  levelId: null,
  staffId: null,
  bundleId: null,
  productLocationId: null,
  ...ids,
  price,
});

describe('services: export data in the price file', () => {
  const levels = [
    { id: 'base', name: 'Основной', isDefault: true, sortOrder: 0 },
    { id: TOP, name: 'Топ', isDefault: false, sortOrder: 1 },
  ].map((level) => ({
    ...level,
    locationId: LOCATION,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const catalog = {
    categories: [{ id: 'c1', name: 'Стрижки', sortOrder: 0 }],
    services: [
      {
        id: S1,
        title: 'Женская',
        description: null,
        durationMinutes: 60,
        price: d('55'),
        categoryId: 'c1',
        sortOrder: 0,
        status: ServiceStatus.ACTIVE,
      },
      {
        id: S2,
        title: 'Мужская',
        description: null,
        durationMinutes: 30,
        price: d('30'),
        categoryId: 'c1',
        sortOrder: 1,
        status: ServiceStatus.ACTIVE,
      },
    ],
    bundles: [
      {
        id: B1,
        title: 'Комплекс',
        categoryId: 'c1',
        sortOrder: 0,
        pricingMode: BundlePricingMode.FIXED,
        fixedPrice: d('90'),
        status: ServiceStatus.ACTIVE,
      },
    ],
  };
  const levelPrices = [{ serviceId: S1, priceLevelId: TOP, price: d('70') }];
  const assignments = [
    { staffId: M1, staffName: 'Анна', serviceId: S1, price: d('60') },
  ];
  // +10% on everything planned for 20 December.
  const timeline = new PriceTimeline([
    {
      id: 'planned',
      effectiveDate: PLANNED,
      items: [
        item(PriceChangeTarget.BASE, { serviceId: S1 }, 6100),
        item(PriceChangeTarget.BASE, { serviceId: S2 }, 3300),
        item(PriceChangeTarget.LEVEL, { serviceId: S1, levelId: TOP }, 7700),
        item(PriceChangeTarget.BUNDLE, { bundleId: B1 }, 9900),
        item(PriceChangeTarget.STAFF, { serviceId: S1, staffId: M1 }, 6600),
      ],
    },
  ]);
  const facts: ServicePriceImportFacts = {
    catalog,
    levels,
    levelPrices,
    assignments,
    timeline,
    date: UPLOAD_DATE,
  };
  const exporter = new ServicePriceExportService(
    { loadPriceCatalog: async () => catalog } as never,
    {
      listLevels: async () => levels,
      listLevelPrices: async () => levelPrices,
    } as never,
    { listActiveAssignments: async () => assignments } as never,
    { getBookingSettings: async () => ({ timezone: 'UTC' }) } as never,
  );
  const reader = new ServicePriceSheetService();

  const readBook = async (
    file: ServicePriceImportUpload,
  ): Promise<ServicePriceBook> => {
    const read = await reader.read(file);
    if (!read.ok) throw new Error(read.reason);
    return {
      ...read.book,
      snapshot: snapshotForLocation(read.book.snapshot, LOCATION),
    };
  };
  const changeOf = (book: ServicePriceBook) => {
    const plan = planServicePriceImport(book, buildImportCatalog(facts));
    expect(plan.errors).toEqual([]);
    return buildImportChange(plan, facts);
  };

  it('writes every exported price to a very hidden protected sheet', async () => {
    const buffer = await fileBuffer(
      exporter.export(LOCATION, new Date('2026-11-26T10:00:00Z')),
    );
    const workbook = await load(buffer);
    expect(workbook.worksheets.map((sheet) => sheet.state)).toEqual([
      'visible',
      'visible',
      'veryHidden',
    ]);
    const hidden = workbook.getWorksheet(PRICE_EXPORT_SHEET_NAME)!;
    // ExcelJS reads the protection but does not type it.
    const { sheetProtection } = hidden as unknown as { sheetProtection: unknown };
    expect(sheetProtection).toMatchObject({ sheet: true });
    const rows: string[][] = [];
    hidden.eachRow((row) =>
      rows.push([String(row.getCell(1).value), String(row.getCell(2).value ?? '')]),
    );
    expect(rows).toEqual([
      ['key', 'value'],
      ['@format', 'klendo-price-export/1'],
      ['@catalog', 'SERVICES'],
      ['@locationId', LOCATION],
      ['@exportedAt', '2026-11-26T10:00:00.000Z'],
      [`base:${S1}`, '55.00'],
      [`level:${S1}:${TOP}`, '70.00'],
      [`base:${S2}`, '30.00'],
      [`level:${S2}:${TOP}`, ''],
      [`bundle:${B1}`, '90.00'],
      [`staff:${S1}:${M1}`, '60.00'],
    ]);
  });

  it('export, edit one cell, upload after a planned change: only that cell changes', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION));
    const book = await readBook(
      await edit(buffer, 'Цены', [{ id: S2, header: 'Базовая цена', value: 35 }]),
    );
    expect(book.snapshot).not.toBeNull();
    const change = changeOf(book);
    expect(change.groups).toHaveLength(1);
    expect(change.groups[0].rows).toEqual([
      expect.objectContaining({
        key: `BASE:${S2}`,
        before: 3300,
        after: 3500,
        replacesScheduledDate: PLANNED,
      }),
    ]);
  });

  it('an untouched export changes nothing, even rows of a deleted service', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION));
    const book = await readBook(upload(buffer));
    const plan = planServicePriceImport(book, {
      ...buildImportCatalog(facts),
      items: new Map(),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.edits).toEqual([]);
    expect(plan.staffEdits).toEqual([]);
  });

  it('a file without export data compares every price and marks the planned prices it replaces', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION));
    const book = await readBook(
      await edit(buffer, 'Цены', [{ id: S2, header: 'Базовая цена', value: 35 }]),
    );
    const change = changeOf({ ...book, snapshot: null });
    const rows = change.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => [row.key, row.before, row.after])).toEqual([
      [`BASE:${S1}`, 6100, 5500],
      [`LEVEL:${S1}:${TOP}`, 7700, 7000],
      [`STAFF:${S1}:${M1}`, 6600, 6000],
      [`BASE:${S2}`, 3300, 3500],
      [`BUNDLE:${B1}`, 9900, 9000],
    ]);
    expect(rows.every((row) => row.replacesScheduledDate === PLANNED)).toBe(true);
  });

  it('export data of another location is ignored', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION));
    const read = await reader.read(upload(buffer));
    if (!read.ok) throw new Error(read.reason);
    expect(read.book.snapshot?.locationId).toBe(LOCATION);
    expect(
      snapshotForLocation(read.book.snapshot, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).toBeNull();
  });

  it('the template has no export data and still creates services', async () => {
    const buffer = await fileBuffer(exporter.template(LOCATION));
    const workbook = await load(buffer);
    expect(workbook.getWorksheet(PRICE_EXPORT_SHEET_NAME)).toBeUndefined();
    const book = await readBook(upload(buffer));
    expect(book.snapshot).toBeNull();
    const plan = planServicePriceImport(book, buildImportCatalog(facts));
    expect(plan.errors).toEqual([]);
    expect(plan.newServices.map((service) => service.title)).toEqual([
      'Женская стрижка',
      'Мужская стрижка',
    ]);
  });
});

describe('products: export data in the price file', () => {
  const product = (productId: string, retailPrice: string): PricedLocationProduct => ({
    productLocationId: `pl-${productId}`,
    productId,
    retailPrice: d(retailPrice),
    status: ProductStatus.ACTIVE,
    name: 'Маска',
    sku: null,
    barcode: null,
    unit: ProductUnit.PIECE,
    categoryId: null,
    categoryName: null,
    categorySortOrder: null,
  });
  const products = [product(PA, '55'), product(PB, '12.30')];
  const refs = new Map(
    products.map((p) => [
      p.productId,
      {
        productLocationId: p.productLocationId,
        productId: p.productId,
        name: p.name,
        sku: null,
        categoryName: null,
        retailPrice: p.retailPrice,
        isForSale: true,
      },
    ]),
  );
  const timeline = new PriceTimeline([
    {
      id: 'planned',
      effectiveDate: PLANNED,
      items: [
        item(PriceChangeTarget.PRODUCT, { productLocationId: `pl-${PA}` }, 6100),
        item(PriceChangeTarget.PRODUCT, { productLocationId: `pl-${PB}` }, 1400),
      ],
    },
  ]);
  const exporter = new ProductPriceExportService(
    { listPriced: async () => products } as never,
    { lastPurchaseUnitCosts: async () => new Map() } as never,
    { getLocale: async () => ({ timezone: 'UTC' }) } as never,
  );
  const reader = new ProductPriceSheetService();
  const rowsOf = async (file: ServicePriceImportUpload, withSnapshot: boolean) => {
    const read = await reader.read(file);
    if (!read.ok) throw new Error(read.reason);
    const sheet = {
      ...read.sheet,
      snapshot: withSnapshot
        ? snapshotForLocation(read.sheet.snapshot, LOCATION)
        : null,
    };
    const plan = planProductPriceImport(sheet, refs);
    expect(plan.errors).toEqual([]);
    return buildProductImportRows(
      plan.prices,
      products,
      UPLOAD_DATE,
      timeline,
      new Map(),
      false,
    );
  };

  it('export, edit one price, upload after a planned change: only that product changes', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION, false));
    const workbook = await load(buffer);
    expect(workbook.getWorksheet(PRICE_EXPORT_SHEET_NAME)?.state).toBe('veryHidden');
    const file = await edit(buffer, 'Цены', [{ id: PB, header: 'Цена', value: '15' }]);
    expect(await rowsOf(file, true)).toEqual([
      expect.objectContaining({
        productId: PB,
        before: 1400,
        after: 1500,
        replacesScheduledDate: PLANNED,
      }),
    ]);
  });

  it('a file without export data marks the row that replaces a planned price', async () => {
    const buffer = await fileBuffer(exporter.export(LOCATION, false));
    const file = await edit(buffer, 'Цены', [{ id: PB, header: 'Цена', value: '15' }]);
    const rows = await rowsOf(file, false);
    expect(rows.map((row) => [row.productId, row.before, row.after, row.replacesScheduledDate])).toEqual([
      [PA, 6100, 5500, PLANNED],
      [PB, 1400, 1500, PLANNED],
    ]);
  });
});
