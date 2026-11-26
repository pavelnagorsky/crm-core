import { ServicePriceImportItemType } from '../enums/service-price-import-item-type.enum.js';
import { ServicePriceImportRowError } from '../enums/service-price-import-row-error.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import { SERVICE_PRICE_SHEET_HEADERS } from '../constants/service-price-import.constants.js';
import { ServicePriceBook } from '../interfaces/service-price-book.interface.js';
import { ServicePriceImportCatalog } from '../interfaces/service-price-import-catalog.interface.js';
import { ServicePriceSheetRow } from '../interfaces/service-price-sheet-row.interface.js';
import {
  parseDurationCell,
  planServicePriceImport,
  serviceKey,
} from './service-price-import.rules.js';
import { parsePriceCell } from './price-cell.rules.js';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const BUNDLE_ID = '22222222-2222-4222-8222-222222222222';
const FLOATING_BUNDLE_ID = '33333333-3333-4333-8333-333333333333';
const STAFF_ID = '44444444-4444-4444-8444-444444444444';
const LEVEL_ID = '55555555-5555-4555-8555-555555555555';

const catalog: ServicePriceImportCatalog = {
  items: new Map([
    [SERVICE_ID, { type: ServicePriceImportItemType.SERVICE, fixed: false }],
    [BUNDLE_ID, { type: ServicePriceImportItemType.BUNDLE, fixed: true }],
    [
      FLOATING_BUNDLE_ID,
      { type: ServicePriceImportItemType.BUNDLE, fixed: false },
    ],
  ]),
  serviceKeys: new Set([serviceKey('Стрижки', 'Женская стрижка')]),
  categories: new Map([['стрижки', 'Стрижки']]),
  levels: [
    { id: 'default', name: 'Основной', isDefault: true },
    { id: LEVEL_ID, name: 'Топ', isDefault: false },
  ],
  staffIds: new Set([STAFF_ID]),
  assignments: new Set([`${STAFF_ID}:${SERVICE_ID}`]),
};

const row = (
  number: number,
  cells: Partial<ServicePriceSheetRow>,
): ServicePriceSheetRow => ({
  row: number,
  id: '',
  category: '',
  type: '',
  title: '',
  duration: '',
  price: '',
  description: '',
  levels: [''],
  ...cells,
});

const book = (
  rows: ServicePriceSheetRow[],
  staff: ServicePriceBook['staff'] = null,
  levelHeader = 'Цена: Топ',
): ServicePriceBook => ({
  prices: {
    headers: { ...SERVICE_PRICE_SHEET_HEADERS },
    levelColumns: [
      { index: 7, header: levelHeader, name: 'Топ', prefixed: true },
    ],
    rows,
  },
  staff,
  snapshot: null,
});

const codes = (plan: ReturnType<typeof planServicePriceImport>) =>
  plan.errors.map((error) => `${error.row}:${error.code}`);

describe('parsePriceCell', () => {
  it.each([
    ['55', '55.00'],
    ['55.5', '55.50'],
    ['55,50', '55.50'],
    ['1 200', '1200.00'],
    ['1 200,5', '1200.50'],
    ['007.10', '7.10'],
    ['0', '0.00'],
    ['55.00000000000001', '55.00'],
  ])('reads %s as %s', (text, expected) => {
    expect(parsePriceCell(text)).toBe(expected);
  });

  it.each(['', '  '])('reads an empty cell as null', (text) => {
    expect(parsePriceCell(text)).toBeNull();
  });

  it.each(['abc', '-5', '55.555', '55 BYN', '1e3', '100000000'])(
    'rejects %s',
    (text) => {
      expect(parsePriceCell(text)).toBeUndefined();
    },
  );
});

describe('parseDurationCell', () => {
  it('accepts whole minutes in range', () => {
    expect(parseDurationCell('60')).toBe(60);
    expect(parseDurationCell('60.0')).toBe(60);
    expect(parseDurationCell('1440')).toBe(1440);
  });

  it('separates empty from invalid', () => {
    expect(parseDurationCell('')).toBeNull();
    expect(parseDurationCell('0')).toBeUndefined();
    expect(parseDurationCell('1441')).toBeUndefined();
    expect(parseDurationCell('1.5')).toBeUndefined();
    expect(parseDurationCell('abc')).toBeUndefined();
  });
});

describe('planServicePriceImport', () => {
  it('turns ID rows into price edits and ignores their other columns', () => {
    const plan = planServicePriceImport(
      book([
        row(2, {
          id: SERVICE_ID.toUpperCase(),
          title: '',
          duration: 'garbage',
          price: '60',
          levels: ['70'],
        }),
        row(3, { id: BUNDLE_ID, price: '100,5', levels: ['9'] }),
        row(4, { id: SERVICE_ID.replace('1', '6') }),
      ]),
      catalog,
    );
    expect(plan.errors).toEqual([
      {
        sheet: ServicePriceImportSheet.PRICES,
        row: 4,
        column: 'ID',
        code: ServicePriceImportRowError.ID_NOT_FOUND,
      },
    ]);
    expect(plan.edits).toEqual([
      {
        row: 2,
        type: ServicePriceImportItemType.SERVICE,
        id: SERVICE_ID,
        basePrice: '60.00',
        levelPrices: [{ levelId: LEVEL_ID, price: '70.00' }],
      },
      {
        row: 3,
        type: ServicePriceImportItemType.BUNDLE,
        id: BUNDLE_ID,
        basePrice: '100.50',
        levelPrices: [],
      },
    ]);
  });

  it('keeps an empty base price as no change and an empty level cell as a removal', () => {
    const plan = planServicePriceImport(
      book([row(2, { id: SERVICE_ID, price: '', levels: [''] })]),
      catalog,
    );
    expect(plan.edits[0].basePrice).toBeNull();
    expect(plan.edits[0].levelPrices).toEqual([
      { levelId: LEVEL_ID, price: null },
    ]);
  });

  it('rejects duplicate IDs, floating bundles and bad prices of ID rows', () => {
    const plan = planServicePriceImport(
      book([
        row(2, { id: SERVICE_ID, price: '10' }),
        row(3, { id: SERVICE_ID, price: '11' }),
        row(4, { id: FLOATING_BUNDLE_ID, price: '11' }),
        row(5, { id: BUNDLE_ID, price: 'x' }),
      ]),
      catalog,
    );
    expect(codes(plan)).toEqual([
      `3:${ServicePriceImportRowError.DUPLICATE_ID}`,
      `4:${ServicePriceImportRowError.BUNDLE_NOT_FIXED}`,
      `5:${ServicePriceImportRowError.PRICE_INVALID}`,
    ]);
    expect(plan.errors[2].column).toBe('Базовая цена');
  });

  it('creates services from rows without ID and names the new categories once', () => {
    const plan = planServicePriceImport(
      book([
        row(2, {
          category: ' стрижки ',
          title: 'Укладка',
          duration: '30',
          price: '25',
          levels: ['35'],
          description: ' Быстро ',
        }),
        row(3, { category: 'Окрашивание', title: 'Тонирование', duration: '90', price: '80' }),
        row(4, { category: 'окрашивание', title: 'Блонд', duration: '120', price: '150' }),
        row(5, { title: 'Без категории', duration: '15', price: '5' }),
      ]),
      catalog,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.newCategories).toEqual(['Окрашивание']);
    expect(plan.newServices.map((item) => item.categoryName)).toEqual([
      'Стрижки',
      'Окрашивание',
      'Окрашивание',
      null,
    ]);
    expect(plan.newServices.map((item) => item.categoryWillBeCreated)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(plan.newServices[0]).toMatchObject({
      title: 'Укладка',
      durationMinutes: 30,
      price: '25.00',
      description: 'Быстро',
      levelPrices: [{ levelId: LEVEL_ID, levelName: 'Топ', price: '35.00' }],
    });
  });

  it('checks the required cells of a new service', () => {
    const plan = planServicePriceImport(
      book([
        row(2, { title: '', duration: '30', price: '5' }),
        row(3, { title: 'A', duration: '', price: '5' }),
        row(4, { title: 'B', duration: '0', price: '5' }),
        row(5, { title: 'C', duration: '30', price: '' }),
        row(6, { title: 'D', duration: '30', price: '-1' }),
        row(7, { title: 'E'.repeat(151), duration: '30', price: '1' }),
        row(8, { title: 'F', type: 'Комплекс', duration: '30', price: '1' }),
        row(9, { title: 'G', category: 'c'.repeat(256), duration: '30', price: '1' }),
        row(10, { title: 'H', duration: '30', price: '1', description: 'd'.repeat(2001) }),
      ]),
      catalog,
    );
    expect(codes(plan)).toEqual([
      `2:${ServicePriceImportRowError.NAME_REQUIRED}`,
      `3:${ServicePriceImportRowError.DURATION_REQUIRED}`,
      `4:${ServicePriceImportRowError.DURATION_INVALID}`,
      `5:${ServicePriceImportRowError.PRICE_REQUIRED}`,
      `6:${ServicePriceImportRowError.PRICE_INVALID}`,
      `7:${ServicePriceImportRowError.NAME_TOO_LONG}`,
      `8:${ServicePriceImportRowError.BUNDLE_CREATE_UNSUPPORTED}`,
      `9:${ServicePriceImportRowError.CATEGORY_TOO_LONG}`,
      `10:${ServicePriceImportRowError.DESCRIPTION_TOO_LONG}`,
    ]);
    expect(plan.newServices).toEqual([]);
  });

  it('rejects a duplicate of an existing service and of another new row', () => {
    const plan = planServicePriceImport(
      book([
        row(2, { category: 'стрижки', title: ' женская  СТРИЖКА', duration: '30', price: '5' }),
        row(3, { category: 'Новая', title: 'Икс', duration: '30', price: '5' }),
        row(4, { category: 'новая', title: 'икс', duration: '30', price: '5' }),
        row(5, { title: 'Икс', duration: '30', price: '5' }),
      ]),
      catalog,
    );
    expect(codes(plan)).toEqual([
      `2:${ServicePriceImportRowError.DUPLICATE_SERVICE}`,
      `4:${ServicePriceImportRowError.DUPLICATE_SERVICE}`,
    ]);
    expect(plan.newServices.map((item) => item.row)).toEqual([3, 5]);
  });

  it('flags a level column that matches no level, in row 1', () => {
    const plan = planServicePriceImport(
      book([row(2, { id: SERVICE_ID, price: '1', levels: ['3'] })], null, 'Цена: Нет'),
      {
        ...catalog,
        levels: [{ id: 'default', name: 'Основной', isDefault: true }],
      },
    );
    expect(plan.errors).toEqual([
      {
        sheet: ServicePriceImportSheet.PRICES,
        row: 1,
        column: 'Цена: Нет',
        code: ServicePriceImportRowError.UNKNOWN_LEVEL_COLUMN,
      },
    ]);
    expect(plan.edits[0].levelPrices).toEqual([]);
  });

  it('checks the personal prices sheet', () => {
    const staffRow = (
      number: number,
      serviceId: string,
      staffId: string,
      price: string,
    ) => ({ row: number, serviceId, staffId, price });
    const plan = planServicePriceImport(
      book([], {
        serviceIdHeader: 'ID услуги',
        staffIdHeader: 'ID мастера',
        priceHeader: 'Цена',
        rows: [
          staffRow(2, SERVICE_ID, STAFF_ID, '12'),
          staffRow(3, SERVICE_ID, STAFF_ID, '13'),
          staffRow(4, SERVICE_ID, 'nope', '13'),
          staffRow(5, BUNDLE_ID, STAFF_ID, '13'),
          staffRow(6, SERVICE_ID.replace('1', '7'), STAFF_ID, '13'),
          staffRow(7, SERVICE_ID, STAFF_ID.replace('4', '8'), ''),
        ],
      }),
      {
        ...catalog,
        staffIds: new Set([STAFF_ID, STAFF_ID.replace('4', '8')]),
      },
    );
    expect(plan.staffEdits).toEqual([
      { row: 2, serviceId: SERVICE_ID, staffId: STAFF_ID, price: '12.00' },
    ]);
    expect(plan.errors.map((error) => `${error.row}:${error.code}`)).toEqual([
      `3:${ServicePriceImportRowError.DUPLICATE_STAFF_PRICE}`,
      `4:${ServicePriceImportRowError.STAFF_NOT_FOUND}`,
      `5:${ServicePriceImportRowError.SERVICE_NOT_FOUND}`,
      `6:${ServicePriceImportRowError.SERVICE_NOT_FOUND}`,
      `7:${ServicePriceImportRowError.STAFF_NOT_ASSIGNED}`,
    ]);
    expect(plan.errors.every((error) => error.sheet === ServicePriceImportSheet.STAFF_PRICES)).toBe(true);
  });

  it('uses the header of the file as the column of an error', () => {
    const custom = book([row(2, { id: SERVICE_ID, price: 'x' })]);
    custom.prices.headers[ServicePriceSheetColumn.PRICE] = 'Цена';
    expect(planServicePriceImport(custom, catalog).errors[0].column).toBe('Цена');
  });
});
