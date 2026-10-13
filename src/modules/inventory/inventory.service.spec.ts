import {
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovementType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { InventoryDocumentTargetStatus } from './enums/inventory-document-target-status.enum.js';
import { InventoryBalanceLockService } from './services/inventory-balance-lock.service.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventorySaleReversalService } from './services/inventory-sale-reversal.service.js';
import { InventoryService } from './inventory.service.js';

const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };

function document(status: InventoryDocumentStatus) {
  const now = new Date('2026-10-01T10:00:00.000Z');
  return {
    id: 'document-1',
    locationId: 'location-1',
    destinationLocationId: null,
    type: InventoryDocumentType.WRITE_OFF,
    status,
    occurredAt: now,
    reference: null,
    supplierName: null,
    reason: 'Damaged',
    note: null,
    createdById: 'owner-1',
    createdByName: 'Owner',
    postedAt: status === InventoryDocumentStatus.POSTED ? now : null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'item-1',
        documentId: 'document-1',
        productLocationId: 'product-location-1',
        productId: 'product-1',
        productName: 'Shampoo',
        productSku: 'SKU-1',
        productUnit: ProductUnit.PIECE,
        quantity: new Prisma.Decimal(2),
        unitCost: null,
        createdAt: now,
      },
    ],
  };
}

function setup(status: InventoryDocumentStatus) {
  const tx = {
    $queryRaw: vi.fn(),
    inventoryDocument: {
      findFirst: vi.fn().mockResolvedValue(document(status)),
      update: vi.fn(),
    },
    inventoryBalance: { upsert: vi.fn(), update: vi.fn() },
    inventoryMovement: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const db = {
    $transaction: vi.fn(
      (
        operation:
          | ((value: typeof tx) => unknown)
          | Promise<unknown>[],
      ): unknown =>
        Array.isArray(operation) ? Promise.all(operation) : operation(tx),
    ),
    inventoryMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    inventoryDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const products = { resolveForInventory: vi.fn() };
  const locations = {
    findById: vi
      .fn()
      .mockResolvedValue({ id: 'location-1', brandId: 'brand-1' }),
  };
  const events = { emit: vi.fn() };
  const compute = new InventoryComputeService();
  const balanceLocks = new InventoryBalanceLockService();
  const saleReversals = new InventorySaleReversalService(compute, balanceLocks);
  const service = new InventoryService(
    db as never,
    products as never,
    locations as never,
    events as never,
    compute,
    balanceLocks,
    saleReversals,
  );
  return { service, tx, db, products, events };
}

describe('InventoryService', () => {
  it('makes repeated posting idempotent', async () => {
    const { service, tx, events } = setup(InventoryDocumentStatus.POSTED);
    tx.$queryRaw.mockResolvedValue([]);

    const result = await service.changeDocumentStatus(
      'location-1',
      'document-1',
      InventoryDocumentTargetStatus.POSTED,
      actor,
    );

    expect(result.status).toBe(InventoryDocumentStatus.POSTED);
    expect(tx.inventoryBalance.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rejects a write-off that would make stock negative after locking the balance', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.OPEN);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'balance-1',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(1),
        averageUnitCost: new Prisma.Decimal(5),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      service.changeDocumentStatus(
        'location-1',
        'document-1',
        InventoryDocumentTargetStatus.POSTED,
        actor,
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(tx.inventoryBalance.upsert).toHaveBeenCalledOnce();
    expect(tx.inventoryBalance.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('posts a tracked sale with a frozen weighted-average cost', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.OPEN);
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'balance-1',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        averageUnitCost: new Prisma.Decimal('7.50'),
        updatedAt: new Date(),
      },
    ]);
    tx.inventoryBalance.update.mockResolvedValue({});
    tx.inventoryMovement.create.mockResolvedValue({});

    const [cost] = await service.postSale(
      'location-1',
      'order-1',
      new Date('2026-10-01T10:00:00.000Z'),
      [
        {
          orderItemId: 'order-item-1',
          productLocationId: 'product-location-1',
          productId: 'product-1',
          productName: 'Shampoo',
          productSku: 'SKU-1',
          productUnit: ProductUnit.PIECE,
          quantity: '2.000',
          trackInventory: true,
        },
      ],
      tx as never,
    );

    expect(cost.unitCost?.toFixed(2)).toBe('7.50');
    expect(cost.lineCost?.toFixed(2)).toBe('15.00');
    expect(tx.inventoryBalance.update).toHaveBeenCalledWith({
      where: { id: 'balance-1' },
      data: {
        quantityOnHand: expect.objectContaining({}),
        averageUnitCost: expect.objectContaining({}),
      },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        type: InventoryMovementType.SALE,
        idempotencyKey: 'order:order-1:item:order-item-1:sale',
      }),
    });
  });

  it('posts a partial sale reversal linked to an order return item', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.OPEN);
    const saleMovement = {
      id: 'movement-1',
      locationId: 'location-1',
      productLocationId: 'product-location-1',
      orderId: 'order-1',
      orderItemId: 'order-item-1',
      type: InventoryMovementType.SALE,
      productId: 'product-1',
      productName: 'Shampoo',
      productSku: 'SKU-1',
      quantityDelta: new Prisma.Decimal(-5),
      unitCost: new Prisma.Decimal('7.50'),
    };
    tx.inventoryMovement.findMany
      .mockResolvedValueOnce([saleMovement])
      .mockResolvedValueOnce([]);
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'balance-1',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(3),
        averageUnitCost: new Prisma.Decimal('7.50'),
        updatedAt: new Date(),
      },
    ]);
    tx.inventoryBalance.update.mockResolvedValue({});
    tx.inventoryMovement.create.mockResolvedValue({});

    await service.reverseSaleItemQuantity(
      'location-1',
      'order-1',
      'order-item-1',
      new Prisma.Decimal(3),
      new Date('2026-10-01T10:05:00.000Z'),
      tx as never,
      'return-item-1',
    );

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        orderReturnItemId: 'return-item-1',
        type: InventoryMovementType.SALE_REVERSAL,
        quantityDelta: expect.objectContaining({}),
        idempotencyKey: 'order:order-1:item:order-item-1:sale-reversal:3.000',
        reversedMovementId: null,
      }),
    });
    const created = tx.inventoryMovement.create.mock.calls[0][0].data;
    expect(created.quantityDelta.toFixed(3)).toBe('3.000');
    expect(created.totalCost.toFixed(2)).toBe('22.50');
  });

  it('counts documents by status for the same type and date filters', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { status: InventoryDocumentStatus.OPEN, _count: { _all: 2 } },
      { status: InventoryDocumentStatus.POSTED, _count: { _all: 5 } },
    ]);
    const service = new InventoryService(
      { inventoryDocument: { groupBy } } as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as never,
      new InventoryComputeService(),
      {} as never,
      {} as never,
    );

    const counts = await service.getDocumentStatusCounts('location-1', {
      type: InventoryDocumentType.RECEIPT,
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        locationId: 'location-1',
        type: InventoryDocumentType.RECEIPT,
        status: undefined,
        occurredAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      },
      _count: { _all: true },
    });
    expect(counts).toEqual([
      { status: InventoryDocumentStatus.OPEN, count: 2 },
      { status: InventoryDocumentStatus.POSTED, count: 5 },
      { status: InventoryDocumentStatus.VOIDED, count: 0 },
    ]);
  });

  it('filters documents by an inclusive calendar date range', async () => {
    const { service, db } = setup(InventoryDocumentStatus.OPEN);

    await service.searchDocuments('location-1', {
      page: 1,
      pageSize: 10,
      orderBy: 'occurredAt',
      type: InventoryDocumentType.ADJUSTMENT,
      from: '2026-10-01',
      to: '2026-10-31',
    } as never);

    expect(db.inventoryDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          locationId: 'location-1',
          type: InventoryDocumentType.ADJUSTMENT,
          status: undefined,
          occurredAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lt: new Date('2026-11-01T00:00:00.000Z'),
          },
        },
      }),
    );
    expect(db.inventoryDocument.count).toHaveBeenCalledWith({
      where: {
        locationId: 'location-1',
        type: InventoryDocumentType.ADJUSTMENT,
        status: undefined,
        occurredAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      },
    });
  });

  it('filters product movements by an inclusive calendar date range', async () => {
    const { service, db, products } = setup(InventoryDocumentStatus.OPEN);
    products.resolveForInventory.mockResolvedValue([
      { id: 'product-location-1' },
    ]);

    await service.searchMovements('location-1', 'product-1', {
      page: 1,
      pageSize: 10,
      orderBy: 'occurredAt',
      from: '2026-10-01',
      to: '2026-10-31',
    } as never);

    expect(db.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationId: 'location-1',
          productLocationId: 'product-location-1',
          occurredAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lt: new Date('2026-11-01T00:00:00.000Z'),
          },
        }),
      }),
    );
    expect(db.inventoryMovement.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        occurredAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
      }),
    });
  });
});
