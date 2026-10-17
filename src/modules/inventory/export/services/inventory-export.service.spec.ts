import {
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { LocaleService } from '../../../../shared/i18n/locale.service.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { InventoryMovementOrderBy } from '../../enums/inventory-movement-order-by.enum.js';
import { InventorySearchOrderBy } from '../../enums/inventory-search-order-by.enum.js';
import { InventoryBalanceView } from '../../interfaces/inventory-balance-view.interface.js';
import { InventoryFacade } from '../../inventory.facade.js';
import { InventoryExportService } from './inventory-export.service.js';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function balance(
  overrides: Partial<InventoryBalanceView> = {},
): InventoryBalanceView {
  return {
    productLocationId: 'product-location-1',
    productId: 'product-1',
    name: 'Шампунь',
    sku: 'SKU-1',
    barcode: '4600000000001',
    unit: ProductUnit.PIECE,
    quantityOnHand: new Prisma.Decimal(5),
    averageUnitCost: new Prisma.Decimal(3),
    stockValue: new Prisma.Decimal(15),
    reorderLevel: new Prisma.Decimal(2),
    lowStock: false,
    outOfStock: false,
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('InventoryExportService', () => {
  const inventory = {
    searchInventory: vi.fn<InventoryFacade['searchInventory']>(),
    searchMovements: vi.fn<InventoryFacade['searchMovements']>(),
  };
  const locations = {
    findById: vi.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Main warehouse',
      currency: 'BYN',
    }),
  };
  const locale = new LocaleService();
  locale.onModuleInit();
  const service = new InventoryExportService(
    inventory as unknown as InventoryFacade,
    locations as never,
    locale,
  );

  beforeEach(() => {
    inventory.searchInventory.mockReset();
    inventory.searchMovements.mockReset();
    locations.findById.mockClear();
  });

  it('exports every balance matching the inventory filters as xlsx', async () => {
    inventory.searchInventory.mockResolvedValue({
      items: [
        balance(),
        balance({
          productLocationId: 'product-location-2',
          productId: 'product-2',
          name: 'Маска',
          sku: null,
          barcode: null,
          quantityOnHand: new Prisma.Decimal(0),
          averageUnitCost: new Prisma.Decimal(4),
          stockValue: new Prisma.Decimal(0),
          reorderLevel: new Prisma.Decimal(1),
          lowStock: true,
          outOfStock: true,
          updatedAt: null,
        }),
      ],
      totalItems: 2,
    });

    const file = await service.stream('location-1', {
      search: 'шам',
      productIds: ['product-1', 'product-2'],
      lowStock: false,
      outOfStock: false,
      orderBy: InventorySearchOrderBy.NAME,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 10,
    });

    expect(inventory.searchInventory).toHaveBeenCalledWith('location-1', {
      search: 'шам',
      productIds: ['product-1', 'product-2'],
      lowStock: false,
      outOfStock: false,
      orderBy: InventorySearchOrderBy.NAME,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 10,
      isExport: true,
    });
    expect(locations.findById).toHaveBeenCalledWith('location-1');
    expect(file.filename).toMatch(
      /^inventory-balances-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    const buffer = await collect(file.stream);
    const grid = await XlsxUtils.read(buffer);
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(3);
    expect(grid.row(1).text(1)).toBe('Товар');
    expect(grid.row(1).text(3)).toBe('Штрихкод');
    expect(grid.row(1).text(5)).toBe('Остаток');
    expect(grid.row(1).text(8)).toBe('Валюта');
    expect(grid.row(1).text(9)).toBe('Минимальный остаток');
    expect(grid.row(1).text(12)).toBe('Обновлён');
    expect(grid.row(2).text(1)).toBe('Шампунь');
    expect(grid.row(2).text(2)).toBe('SKU-1');
    expect(grid.row(2).text(3)).toBe('4600000000001');
    expect(grid.row(2).text(4)).toBe('штук (шт)');
    expect(grid.row(2).text(5)).toBe('5.000');
    expect(grid.row(2).text(6)).toBe('3.00');
    expect(grid.row(2).text(7)).toBe('15.00');
    expect(grid.row(2).text(8)).toBe('BYN');
    expect(grid.row(2).text(10)).toBe('Нет');
    expect(grid.row(2).text(11)).toBe('Нет');
    expect(grid.row(2).text(12)).toBe('2026-10-01');
    expect(grid.row(3).text(2)).toBe('');
    expect(grid.row(3).text(3)).toBe('');
    expect(grid.row(3).text(8)).toBe('BYN');
    expect(grid.row(3).text(10)).toBe('Да');
    expect(grid.row(3).text(11)).toBe('Да');
    expect(grid.row(3).text(12)).toBe('');
  });

  it('exports every movement matching the movement filters as xlsx', async () => {
    inventory.searchMovements.mockResolvedValue({
      items: [
        {
          id: 'movement-1',
          locationId: 'location-1',
          productLocationId: 'product-location-1',
          documentId: 'document-1',
          documentItemId: 'document-item-1',
          orderId: null,
          orderItemId: null,
          orderReturnItemId: null,
          sourceType: InventoryMovementSourceType.INVENTORY_DOCUMENT,
          sourceId: 'document-1',
          sourceLocationId: 'location-1',
          type: InventoryMovementType.RECEIPT,
          productId: 'product-1',
          productName: 'Shampoo',
          productSku: 'SKU-1',
          quantityDelta: new Prisma.Decimal(5),
          quantityBefore: new Prisma.Decimal(0),
          quantityAfter: new Prisma.Decimal(5),
          stockValueBefore: new Prisma.Decimal(0),
          stockValueAfter: new Prisma.Decimal(15),
          sequence: 1n,
          averageUnitCostBefore: new Prisma.Decimal(0),
          averageUnitCostAfter: new Prisma.Decimal(3),
          unitCost: new Prisma.Decimal(3),
          totalCost: new Prisma.Decimal(15),
          occurredAt: new Date('2026-10-02T09:30:00.000Z'),
          idempotencyKey: 'document-1:post:document-item-1',
          reversedMovementId: null,
          createdAt: new Date('2026-10-02T09:31:00.000Z'),
        },
      ],
      totalItems: 1,
    });

    const file = await service.streamMovements('location-1', 'product-1', {
      type: InventoryMovementType.RECEIPT,
      from: '2026-10-01',
      to: '2026-10-31',
      orderBy: InventoryMovementOrderBy.OCCURRED_AT,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 10,
    });

    expect(inventory.searchMovements).toHaveBeenCalledWith(
      'location-1',
      'product-1',
      {
        type: InventoryMovementType.RECEIPT,
        from: '2026-10-01',
        to: '2026-10-31',
        orderBy: InventoryMovementOrderBy.OCCURRED_AT,
        orderDirection: OrderDirection.ASC,
        page: 1,
        pageSize: 10,
        isExport: true,
      },
    );
    expect(locations.findById).toHaveBeenCalledWith('location-1');
    expect(file.filename).toMatch(
      /^inventory-movements-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    const buffer = await collect(file.stream);
    const grid = await XlsxUtils.read(buffer);
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(2);
    expect(grid.row(1).text(6)).toBe('Учетная стоимость / БЕИ');
    expect(grid.row(1).text(7)).toBe('Учетная стоимость изменения');
    expect(grid.row(1).text(8)).toBe('Валюта');
    expect(grid.row(1).text(9)).toBe('Остаток до');
    expect(grid.row(1).text(10)).toBe('Остаток после');
    expect(grid.row(1).text(13)).toBe('ID');
    expect(grid.row(2).text(1)).toBe('2026-10-02T09:30:00.000Z');
    expect(grid.row(2).text(3)).toBe('Shampoo');
    expect(grid.row(2).text(4)).toBe('SKU-1');
    expect(grid.row(2).text(5)).toBe('5.000');
    expect(grid.row(2).text(6)).toBe('3.00');
    expect(grid.row(2).text(7)).toBe('15.00');
    expect(grid.row(2).text(8)).toBe('BYN');
    expect(grid.row(2).text(9)).toBe('0.000');
    expect(grid.row(2).text(10)).toBe('5.000');
    expect(grid.row(2).text(11)).toBe('document-1');
    expect(grid.row(2).text(12)).toBe('');
    expect(grid.row(2).text(13)).toBe('movement-1');
    expect(grid.row(2).text(14)).toBe('2026-10-02T09:31:00.000Z');
  });

  it('exports an inventory statement for manual stock count', async () => {
    inventory.searchInventory.mockResolvedValue({
      items: [
        balance({ name: 'Shampoo', quantityOnHand: new Prisma.Decimal(5) }),
        balance({
          productLocationId: 'product-location-2',
          productId: 'product-2',
          name: 'Mask',
          sku: null,
          barcode: null,
          quantityOnHand: new Prisma.Decimal(0),
          averageUnitCost: new Prisma.Decimal(4),
          stockValue: new Prisma.Decimal(0),
          reorderLevel: new Prisma.Decimal(1),
          lowStock: true,
          outOfStock: true,
          updatedAt: null,
        }),
      ],
      totalItems: 2,
    });

    const file = await service.streamInventoryStatement('location-1');

    expect(locations.findById).toHaveBeenCalledWith('location-1');
    expect(inventory.searchInventory).toHaveBeenCalledWith('location-1', {
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    expect(file.filename).toMatch(
      /^inventory-statement-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    const buffer = await collect(file.stream);
    const grid = await XlsxUtils.read(buffer);
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.row(1).text(1)).toBe('Инвентаризационная ведомость');
    expect(grid.row(2).text(2)).toBe('Main warehouse');
    expect(grid.row(5).text(4)).toBe('БЕИ');
    expect(grid.row(5).text(5)).toBe('Учетный остаток');
    expect(grid.row(5).text(6)).toBe('Факт');
    expect(grid.row(6).text(1)).toBe('1');
    expect(grid.row(6).text(2)).toBe('Shampoo');
    expect(grid.row(6).text(5)).toBe('5.000');
    expect(grid.row(6).text(6)).toBe('');
    expect(grid.row(7).text(1)).toBe('2');
    expect(grid.row(7).text(2)).toBe('Mask');
    expect(grid.row(7).text(5)).toBe('0.000');
    expect(grid.row(9).text(1)).toBe('Ответственный от отдела автоматизации');
    expect(grid.row(10).text(1)).toBe('Ответственный от склада');
    expect(grid.row(10).text(4)).toBe('Подпись');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0],
    );
    const worksheet = workbook.worksheets[0];
    expect(worksheet?.getCell('A5').border.top?.style).toBe('thin');
    expect(worksheet?.getCell('F7').border.right?.style).toBe('thin');
    expect(worksheet?.getCell('B9').border.bottom?.style).toBe('medium');
    expect(worksheet?.getCell('F10').border.bottom?.style).toBe('medium');
  });
});
