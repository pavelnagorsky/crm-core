import { PassThrough } from 'stream';
import { InventoryMovementType, Prisma, ProductUnit } from '@prisma/client';
import ExcelJS from 'exceljs';
import { LocaleService } from '../../../shared/i18n/locale.service.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { InventoryReportService } from './inventory-report.service.js';
import { InventoryReportMovementRow } from './interfaces/inventory-report-movement-row.interface.js';
import { InventoryTurnoverBucketRow } from './interfaces/inventory-turnover-bucket-row.interface.js';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function setup() {
  const db = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const locations = {
    findById: vi.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Салон',
      currency: 'BYN',
      timezone: 'Europe/Minsk',
    }),
  };
  const locale = new LocaleService();
  locale.onModuleInit();
  return {
    service: new InventoryReportService(
      db as never,
      locations as never,
      locale,
    ),
    db,
    locations,
  };
}

function bucket(
  bucketName: string,
  quantity: string,
  value: string,
  productLocationId = 'product-location-1',
  name = 'Шампунь',
): InventoryTurnoverBucketRow {
  return {
    productLocationId,
    name,
    sku: 'SKU-1',
    unit: ProductUnit.PIECE,
    bucket: bucketName,
    quantity,
    value,
  };
}

describe('InventoryReportService', () => {
  it('rejects an inverted or impossible period before reading the location', async () => {
    const { service, locations } = setup();
    await expect(
      service.build('location-1', { from: '2026-10-02', to: '2026-10-01' }),
    ).rejects.toMatchObject({ errorCode: 'INVENTORY_REPORT_PERIOD_INVALID' });
    await expect(
      service.build('location-1', { from: '2026-02-31', to: '2026-03-01' }),
    ).rejects.toMatchObject({ errorCode: 'INVENTORY_REPORT_PERIOD_INVALID' });
    expect(locations.findById).not.toHaveBeenCalled();
  });

  it('closes the period as opening plus every movement inside the location day', async () => {
    const { service, db } = setup();
    const queries: { values: unknown[] }[] = [];
    db.$queryRaw.mockImplementation((query: { values: unknown[] }) => {
      queries.push(query);
      if (queries.length === 1) {
        return Promise.resolve([
          bucket('OPENING', '10.000', '100.00'),
          bucket(InventoryMovementType.RECEIPT, '5.000', '60.00'),
          bucket(InventoryMovementType.SALE, '-2.000', '-32.00'),
          bucket('OPENING', '0.000', '0.00', 'product-location-2', 'Пустой'),
        ]);
      }
      const movement: InventoryReportMovementRow = {
        occurredAt: new Date('2026-10-01T10:00:00.000Z'),
        type: InventoryMovementType.SALE,
        productName: 'Шампунь',
        productSku: 'SKU-1',
        quantityDelta: '-2.000',
        unitCost: '16.00',
        totalCost: '-32.00',
        quantityBefore: '15.000',
        quantityAfter: '13.000',
        documentReference: null,
        orderId: 'order-1',
      };
      return Promise.resolve([movement]);
    });

    const report = await service.build('location-1', {
      from: '2026-10-01',
      to: '2026-10-01',
    });

    expect(queries[0].values).toEqual([
      new Date('2026-09-30T21:00:00.000Z'),
      'location-1',
      new Date('2026-10-01T21:00:00.000Z'),
    ]);
    expect(queries[1].values).toEqual([
      'location-1',
      new Date('2026-09-30T21:00:00.000Z'),
      new Date('2026-10-01T21:00:00.000Z'),
    ]);
    expect(report.lines).toHaveLength(1);
    const line = report.lines[0];
    expect(QuantityService.format(line.openingQuantity)).toBe('10.000');
    expect(QuantityService.format(line.quantities.RECEIPT)).toBe('5.000');
    expect(QuantityService.format(line.quantities.SALE)).toBe('-2.000');
    expect(QuantityService.format(line.closingQuantity)).toBe('13.000');
    expect(MoneyService.format(line.openingValue)).toBe('100.00');
    expect(MoneyService.format(line.periodValue)).toBe('28.00');
    expect(MoneyService.format(line.closingValue)).toBe('128.00');
    expect(
      line.openingQuantity
        .plus(line.quantities.RECEIPT)
        .plus(line.quantities.SALE)
        .equals(line.closingQuantity),
    ).toBe(true);
    expect(
      line.openingValue.plus(line.periodValue).equals(line.closingValue),
    ).toBe(true);
  });

  it('writes the turnover sheet and the movement journal as xlsx', async () => {
    const { service, db } = setup();
    db.$queryRaw
      .mockReturnValueOnce(
        Promise.resolve([
          bucket('OPENING', '10.000', '100.00'),
          bucket(InventoryMovementType.RECEIPT, '5.000', '60.00'),
          bucket(InventoryMovementType.SALE, '-2.000', '-32.00'),
        ]),
      )
      .mockReturnValueOnce(
        Promise.resolve([
          {
            occurredAt: new Date('2026-10-01T10:00:00.000Z'),
            type: InventoryMovementType.SALE,
            productName: 'Шампунь',
            productSku: 'SKU-1',
            quantityDelta: new Prisma.Decimal('-2.000'),
            unitCost: new Prisma.Decimal('16.00'),
            totalCost: new Prisma.Decimal('-32.00'),
            quantityBefore: new Prisma.Decimal('15.000'),
            quantityAfter: new Prisma.Decimal('13.000'),
            documentReference: 'Накладная 12',
            orderId: 'order-1',
          } satisfies InventoryReportMovementRow,
        ]),
      );

    const file = await service.exportVedomost('location-1', {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(file.filename).toBe('inventory-vedomost-2026-10-01.xlsx');
    const buffer = await collect(file.stream);
    const grid = await XlsxService.read(buffer);
    expect(grid?.row(1).text(1)).toBe('Оборотная ведомость склада');
    expect(grid?.row(2).text(2)).toBe('Салон');
    expect(grid?.row(3).text(2)).toBe('2026-10-01 — 2026-10-31');
    expect(grid?.row(4).text(2)).toBe('BYN');
    expect(grid?.row(6).text(1)).toBe('Товар');
    expect(grid?.row(6).text(5)).toBe('Приход');
    expect(grid?.row(6).text(9)).toBe('Продажа');
    expect(grid?.row(7).text(1)).toBe('Шампунь');
    expect(grid?.row(7).text(3)).toBe('шт');
    expect(grid?.row(7).text(4)).toBe('10.000');
    expect(grid?.row(7).text(5)).toBe('5.000');
    expect(grid?.row(7).text(9)).toBe('-2.000');
    expect(grid?.row(7).text(14)).toBe('13.000');
    expect(grid?.row(7).text(17)).toBe('128.00');
    expect(grid?.row(9).text(1)).toBe('Итого');
    expect(grid?.row(9).text(14)).toBe('13.000');
    expect(grid?.row(9).text(17)).toBe('128.00');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0],
    );
    const journal = workbook.worksheets[1];
    expect(journal.name).toBe('Движения');
    expect(journal.getRow(1).getCell(1).value).toBe('Движения склада');
    expect(journal.getRow(5).getCell(1).value).toBe('2026-10-01 13:00:00');
    expect(journal.getRow(5).getCell(2).value).toBe('Продажа');
    expect(journal.getRow(5).getCell(5).value).toBe('-2.000');
    expect(journal.getRow(5).getCell(10).value).toBe('Накладная 12');
    expect(journal.getRow(5).getCell(11).value).toBe('order-1');
  });

  it('refuses a movement type the statement has no column for', async () => {
    const { service, db } = setup();
    db.$queryRaw
      .mockReturnValueOnce(Promise.resolve([bucket('GIFT', '1.000', '10.00')]))
      .mockReturnValueOnce(Promise.resolve([]));

    await expect(
      service.build('location-1', { from: '2026-10-01', to: '2026-10-01' }),
    ).rejects.toThrow('Unknown inventory movement bucket: GIFT');
  });
});
