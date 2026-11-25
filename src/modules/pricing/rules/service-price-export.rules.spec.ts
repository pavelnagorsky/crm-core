import { BundlePricingMode, Prisma, ServiceStatus } from '@prisma/client';
import {
  buildServicePriceExport,
  buildServicePriceTemplate,
} from './service-price-export.rules.js';

const d = (value: string) => new Prisma.Decimal(value);

const levels = [
  { id: 'base', name: 'Основной', isDefault: true, sortOrder: 0 },
  { id: 'top', name: 'Топ', isDefault: false, sortOrder: 1 },
].map((level) => ({
  ...level,
  locationId: 'l',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

describe('buildServicePriceExport', () => {
  const sheets = buildServicePriceExport({
    catalog: {
      categories: [
        { id: 'c1', name: 'Стрижки', sortOrder: 0 },
        { id: 'c2', name: 'Уход', sortOrder: 1 },
      ],
      services: [
        {
          id: 's1',
          title: 'Женская',
          description: null,
          durationMinutes: 60,
          price: d('50'),
          categoryId: 'c1',
          sortOrder: 0,
          status: ServiceStatus.ACTIVE,
        },
        {
          id: 's2',
          title: 'Без категории',
          description: 'Описание',
          durationMinutes: 15,
          price: d('5.5'),
          categoryId: null,
          sortOrder: 0,
          status: ServiceStatus.INACTIVE,
        },
      ],
      bundles: [
        {
          id: 'b1',
          title: 'Комплекс',
          categoryId: 'c1',
          sortOrder: 0,
          pricingMode: BundlePricingMode.FIXED,
          fixedPrice: d('90'),
          status: ServiceStatus.ACTIVE,
        },
        {
          id: 'b2',
          title: 'Сумма',
          categoryId: 'c1',
          sortOrder: 1,
          pricingMode: BundlePricingMode.SUM,
          fixedPrice: null,
          status: ServiceStatus.ACTIVE,
        },
      ],
    },
    levels,
    levelPrices: [{ serviceId: 's1', priceLevelId: 'top', price: d('60') }],
    assignments: [
      { staffId: 'm1', staffName: 'Анна', serviceId: 's1', price: d('55') },
      { staffId: 'm1', staffName: 'Анна', serviceId: 'gone', price: null },
      { staffId: 'm2', staffName: 'Борис', serviceId: 's2', price: null },
    ],
  });

  it('has a column per non-default level between the price and the description', () => {
    expect(sheets.priceColumns.map((column) => column.header)).toEqual([
      'ID',
      'Категория',
      'Тип',
      'Название',
      'Длительность (мин)',
      'Базовая цена',
      'Цена: Топ',
      'Описание',
    ]);
  });

  it('lists services, then FIXED bundles, per category, then the uncategorized', () => {
    expect(sheets.priceRows.map((row) => row.id)).toEqual(['s1', 'b1', 's2']);
    expect(sheets.priceRows[0]).toMatchObject({
      category: 'Стрижки',
      type: 'Услуга',
      duration: 60,
      price: 50,
      'level:top': 60,
    });
    expect(sheets.priceRows[1]).toMatchObject({
      type: 'Комплекс',
      duration: '',
      price: 90,
    });
    expect(sheets.priceRows[2]).toMatchObject({
      category: '',
      price: 5.5,
      'level:top': '',
      description: 'Описание',
    });
  });

  it('lists the personal prices of known services, blank when none', () => {
    expect(sheets.staffRows).toEqual([
      {
        serviceId: 's1',
        service: 'Женская',
        staffId: 'm1',
        staff: 'Анна',
        price: 55,
      },
      {
        serviceId: 's2',
        service: 'Без категории',
        staffId: 'm2',
        staff: 'Борис',
        price: '',
      },
    ]);
  });
});

describe('buildServicePriceTemplate', () => {
  it('has two example services without ID and level examples', () => {
    const sheets = buildServicePriceTemplate(levels);
    expect(sheets.priceRows).toHaveLength(2);
    expect(sheets.priceRows[0]).toMatchObject({
      title: 'Женская стрижка',
      duration: 60,
      price: 50,
      'level:top': 60,
    });
    expect(sheets.priceRows[0].id).toBeUndefined();
    expect(sheets.priceRows[1]['level:top']).toBeUndefined();
    expect(sheets.staffRows).toEqual([]);
    expect(sheets.priceColumns).toHaveLength(8);
  });
});
