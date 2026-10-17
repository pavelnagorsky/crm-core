import { Prisma, ProductUnit } from '@prisma/client';
import { InventoryAnalyticsService } from './inventory-analytics.service.js';

function setup() {
  const db = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return {
    service: new InventoryAnalyticsService(db as never),
    db,
  };
}

describe('InventoryAnalyticsService', () => {
  it('returns inventory KPI aggregates and replenishment items', async () => {
    const { service, db } = setup();
    const updatedAt = new Date('2026-10-08T12:00:00.000Z');
    db.$queryRaw
      .mockReturnValueOnce(
        Promise.resolve([
          {
            totalProducts: 12,
            lowStockCount: 4,
            outOfStockCount: 2,
            stockValue: new Prisma.Decimal('18420.00'),
            deadStockCount: 3,
            movingProductsCount: 7,
          },
        ]),
      )
      .mockReturnValueOnce(
        Promise.resolve([
          {
            productLocationId: 'product-location-1',
            productId: 'product-1',
            name: 'Shampoo',
            sku: 'SKU-1',
            barcode: null,
            unit: ProductUnit.PIECE,
            quantityOnHand: new Prisma.Decimal(0),
            reorderLevel: new Prisma.Decimal(5),
            missingQuantity: new Prisma.Decimal(5),
            stockValue: new Prisma.Decimal(0),
            updatedAt,
          },
        ]),
      );

    const result = await service.getKpi('location-1', {
      deadStockDays: 90,
      movementDays: 30,
      topLimit: 5,
    });

    expect(result.totalProducts).toBe(12);
    expect(result.lowStockCount).toBe(4);
    expect(result.outOfStockCount).toBe(2);
    expect(result.stockValue.toFixed(2)).toBe('18420.00');
    expect(result.deadStockCount).toBe(3);
    expect(result.movingProductsCount).toBe(7);
    expect(result.topReplenishmentItems).toEqual([
      expect.objectContaining({
        productLocationId: 'product-location-1',
        missingQuantity: expect.objectContaining({}),
        updatedAt,
      }),
    ]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
