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
import { InventoryComputeService } from './services/inventory-compute.service.js';
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
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const products = { resolveForInventory: vi.fn() };
  const locations = {
    findById: vi
      .fn()
      .mockResolvedValue({ id: 'location-1', brandId: 'brand-1' }),
  };
  const events = { emit: vi.fn() };
  const service = new InventoryService(
    db as never,
    products as never,
    locations as never,
    events as never,
    new InventoryComputeService(),
  );
  return { service, tx, events };
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
});
