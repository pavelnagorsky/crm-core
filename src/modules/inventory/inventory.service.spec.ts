import {
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { InventoryDocumentDraftService } from './services/inventory-document-draft.service.js';
import { InventoryDocumentItemComputeService } from './services/inventory-document-item-compute.service.js';
import { InventoryDocumentTargetStatus } from './enums/inventory-document-target-status.enum.js';
import { InventoryDocumentWithItems } from './interfaces/inventory-document-with-items.interface.js';
import { InventoryBalanceLockService } from './services/inventory-balance-lock.service.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventorySaleReversalService } from './services/inventory-sale-reversal.service.js';
import { InventoryService } from './inventory.service.js';

const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };

function document(status: InventoryDocumentStatus): InventoryDocumentWithItems {
  const now = new Date('2026-10-01T10:00:00.000Z');
  return {
    id: 'document-1',
    locationId: 'location-1',
    destinationLocationId: null,
    supplierId: null,
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
        totalCost: null,
        position: 0,
        packagingId: null,
        packagingName: null,
        packagingFactor: null,
        packageQuantity: null,
        packageUnitCost: null,
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
    inventoryDocumentItem: { deleteMany: vi.fn() },
    inventoryMovement: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const db = {
    $transaction: vi.fn(
      (
        operation: ((value: typeof tx) => unknown) | Promise<unknown>[],
      ): unknown =>
        Array.isArray(operation) ? Promise.all(operation) : operation(tx),
    ),
    inventoryMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    inventoryBalance: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    inventoryDocument: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const products = {
    resolveForInventory: vi.fn(),
    listTrackedForInventory: vi.fn(),
  };
  const suppliers = {
    resolveActiveForDocument: vi.fn(),
  };
  const locations = {
    acquireActiveOperationLock: vi.fn().mockResolvedValue(true),
    findById: vi
      .fn()
      .mockResolvedValue({ id: 'location-1', brandId: 'brand-1' }),
  };
  const events = { emit: vi.fn() };
  const compute = new InventoryComputeService();
  const balanceLocks = new InventoryBalanceLockService();
  const saleReversals = new InventorySaleReversalService(compute, balanceLocks);
  const packagings = { resolveForReceipt: vi.fn().mockResolvedValue([]) };
  const drafts = new InventoryDocumentDraftService(
    products as never,
    packagings as never,
    suppliers as never,
    locations as never,
    new InventoryDocumentItemComputeService(),
  );
  const service = new InventoryService(
    db as never,
    products as never,
    drafts,
    locations as never,
    events as never,
    compute,
    balanceLocks,
    saleReversals,
  );
  return { service, tx, db, products, suppliers, packagings, events };
}

describe('InventoryService', () => {
  it('edits a saved receipt with archived packaging using its snapshot and the open transaction', async () => {
    const { service, tx, products, packagings } = setup(
      InventoryDocumentStatus.OPEN,
    );
    const saved = document(InventoryDocumentStatus.OPEN);
    saved.type = InventoryDocumentType.RECEIPT;
    saved.items[0] = {
      ...saved.items[0],
      packagingId: 'archived-box',
      packagingName: 'Original box',
      packagingFactor: new Prisma.Decimal(30),
      quantity: new Prisma.Decimal(30),
      packageQuantity: new Prisma.Decimal(1),
      packageUnitCost: new Prisma.Decimal(100),
      unitCost: new Prisma.Decimal('3.33333333'),
      totalCost: new Prisma.Decimal(100),
    };
    tx.inventoryDocument.findFirst.mockResolvedValue(saved);
    tx.inventoryDocument.update.mockResolvedValue(saved);
    tx.$queryRaw.mockResolvedValue([]);
    products.resolveForInventory.mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        product: { name: 'Shampoo', sku: null, unit: ProductUnit.PIECE },
      },
    ]);
    await service.updateDocument(
      'location-1',
      saved.id,
      {
        type: InventoryDocumentType.RECEIPT,
        occurredAt: saved.occurredAt.toISOString(),
        note: 'Updated note',
        items: [
          {
            productId: 'product-1',
            packagingId: 'archived-box',
            packageQuantity: '2.000',
            packageUnitCost: '100.00',
          },
        ],
      },
      actor,
    );
    const line =
      tx.inventoryDocument.update.mock.calls[0][0].data.items.create[0];
    expect(line.quantity.toString()).toBe('60');
    expect(line.totalCost.toFixed(2)).toBe('200.00');
    expect(line.packagingName).toBe('Original box');
    expect(packagings.resolveForReceipt).not.toHaveBeenCalled();
    expect(products.resolveForInventory).toHaveBeenCalledWith(
      'location-1',
      ['product-1'],
      tx,
    );
    expect(tx.inventoryDocumentItem.deleteMany).toHaveBeenCalledWith({
      where: { documentId: saved.id },
    });
  });

  it('rejects archived packaging in a new receipt', async () => {
    const { service, products, db } = setup(InventoryDocumentStatus.OPEN);
    products.resolveForInventory.mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        product: { name: 'Shampoo', sku: null, unit: ProductUnit.PIECE },
      },
    ]);
    await expect(
      service.createDocument(
        'location-1',
        {
          type: InventoryDocumentType.RECEIPT,
          occurredAt: '2026-10-01T10:00:00.000Z',
          items: [
            {
              productId: 'product-1',
              packagingId: 'archived-box',
              packageQuantity: '1.000',
              packageUnitCost: '100.00',
            },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'INVENTORY_PACKAGING_INVALID' });
    expect(db.inventoryDocument.create).not.toHaveBeenCalled();
  });

  it('checks that a draft is editable before resolving catalogue data', async () => {
    const { service, products, tx } = setup(InventoryDocumentStatus.POSTED);
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.updateDocument(
        'location-1',
        'document-1',
        {
          type: InventoryDocumentType.RECEIPT,
          occurredAt: '2026-10-01T10:00:00.000Z',
          items: [],
        },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'INVENTORY_DOCUMENT_NOT_OPEN' });
    expect(products.resolveForInventory).not.toHaveBeenCalled();
    expect(tx.inventoryDocumentItem.deleteMany).not.toHaveBeenCalled();
  });
  it.each([
    [0, '0.00', '3.33'],
    [1, '3.33', '3.34'],
    [2, '6.67', '3.33'],
  ] as const)(
    'allocates exact return costs after %s previous units',
    async (previousQuantity, previousCost, expectedCost) => {
      const { service, tx } = setup(InventoryDocumentStatus.OPEN);
      const original = {
        id: 'sale',
        locationId: 'location-1',
        productLocationId: 'product-location-1',
        orderItemId: 'order-item-1',
        productId: 'product-1',
        productName: 'Shampoo',
        productSku: null,
        quantityDelta: new Prisma.Decimal(-3),
        unitCost: new Prisma.Decimal('3.33333333'),
        totalCost: new Prisma.Decimal(-10),
      };
      tx.inventoryMovement.findMany
        .mockResolvedValueOnce([original])
        .mockResolvedValueOnce(
          previousQuantity
            ? [
                {
                  orderItemId: original.orderItemId,
                  quantityDelta: new Prisma.Decimal(previousQuantity),
                  totalCost: new Prisma.Decimal(previousCost),
                },
              ]
            : [],
        );
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'balance',
          productLocationId: original.productLocationId,
          quantityOnHand: new Prisma.Decimal(previousQuantity),
          stockValue: new Prisma.Decimal(previousCost),
          averageUnitCost: new Prisma.Decimal(0),
        },
      ]);
      await service.reverseSaleItemQuantity(
        'location-1',
        'order-1',
        original.orderItemId,
        new Prisma.Decimal(1),
        new Date(),
        tx as never,
      );
      const movement = tx.inventoryMovement.create.mock.calls[0][0].data;
      expect(movement.totalCost.toFixed(2)).toBe(expectedCost);
      expect(movement.stockValueAfter.toFixed(2)).toBe(
        new Prisma.Decimal(previousCost).plus(expectedCost).toFixed(2),
      );
    },
  );
  it('accepts boxes and loose pieces of the same product in a single receipt', async () => {
    const { service, db, products, packagings } = setup(
      InventoryDocumentStatus.OPEN,
    );
    products.resolveForInventory.mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        product: { name: 'Shampoo', sku: null, unit: ProductUnit.PIECE },
      },
    ]);
    packagings.resolveForReceipt.mockResolvedValue([
      {
        id: 'box',
        productId: 'product-1',
        name: 'Box',
        quantityInBaseUnit: new Prisma.Decimal(30),
        isActive: true,
      },
    ]);
    db.inventoryDocument.create.mockResolvedValue({
      id: 'receipt',
      type: InventoryDocumentType.RECEIPT,
    });
    await service.createDocument(
      'location-1',
      {
        type: InventoryDocumentType.RECEIPT,
        occurredAt: '2026-10-01T10:00:00.000Z',
        items: [
          {
            productId: 'product-1',
            packagingId: 'box',
            packageQuantity: '2.000',
            packageUnitCost: '100.00',
          },
          { productId: 'product-1', quantity: '5.000', unitCost: '4.00' },
        ],
      },
      actor,
    );
    expect(products.resolveForInventory).toHaveBeenCalledWith(
      'location-1',
      ['product-1'],
      undefined,
    );
    const items =
      db.inventoryDocument.create.mock.calls[0][0].data.items.create;
    expect(
      items.map((item: { quantity: Prisma.Decimal }) =>
        item.quantity.toString(),
      ),
    ).toEqual(['60', '5']);
    expect(
      items.map((item: { totalCost: Prisma.Decimal }) =>
        item.totalCost.toFixed(2),
      ),
    ).toEqual(['200.00', '20.00']);
    expect(items.map((item: { position: number }) => item.position)).toEqual([
      0, 1,
    ]);
  });

  it('posts saved packaging snapshots without resolving the current packaging definition', async () => {
    const { service, tx, packagings } = setup(InventoryDocumentStatus.OPEN);
    const receipt = {
      ...document(InventoryDocumentStatus.OPEN),
      type: InventoryDocumentType.RECEIPT,
    };
    tx.inventoryDocument.findFirst.mockResolvedValue({
      ...receipt,
      items: [
        {
          ...receipt.items[0],
          quantity: new Prisma.Decimal(60),
          unitCost: new Prisma.Decimal('3.33333333'),
          totalCost: new Prisma.Decimal(200),
          packagingId: 'archived-box',
        },
        {
          ...receipt.items[0],
          id: 'item-2',
          quantity: new Prisma.Decimal(5),
          unitCost: new Prisma.Decimal(4),
          totalCost: new Prisma.Decimal(20),
        },
      ],
    });
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'balance',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(0),
        stockValue: new Prisma.Decimal(0),
      },
    ]);
    tx.inventoryDocument.update.mockResolvedValue({
      ...receipt,
      status: InventoryDocumentStatus.POSTED,
    });
    await service.changeDocumentStatus(
      'location-1',
      'document-1',
      InventoryDocumentTargetStatus.POSTED,
      actor,
    );
    const movements = tx.inventoryMovement.create.mock.calls.map(
      ([args]) => args.data,
    );
    expect(movements.map((movement) => movement.totalCost.toFixed(2))).toEqual([
      '200.00',
      '20.00',
    ]);
    expect(movements[1].quantityAfter.toString()).toBe('65');
    expect(movements[1].stockValueAfter.toFixed(2)).toBe('220.00');
    expect(packagings.resolveForReceipt).not.toHaveBeenCalled();
  });

  it('reverses multiple receipt lines for the same balance in reverse ledger order', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.POSTED);
    const movement = {
      id: 'first',
      documentId: 'document-1',
      documentItemId: 'item-1',
      locationId: 'location-1',
      productLocationId: 'product-location-1',
      productId: 'product-1',
      productName: 'Shampoo',
      productSku: null,
      quantityBefore: new Prisma.Decimal(0),
      quantityAfter: new Prisma.Decimal(30),
      averageUnitCostBefore: new Prisma.Decimal(0),
      averageUnitCostAfter: new Prisma.Decimal('3.33333333'),
      stockValueBefore: new Prisma.Decimal(0),
      stockValueAfter: new Prisma.Decimal(100),
      unitCost: new Prisma.Decimal('3.33333333'),
      totalCost: new Prisma.Decimal(100),
    };
    const last = {
      ...movement,
      id: 'last',
      documentItemId: 'item-2',
      quantityBefore: new Prisma.Decimal(30),
      quantityAfter: new Prisma.Decimal(35),
      averageUnitCostBefore: new Prisma.Decimal('3.33333333'),
      averageUnitCostAfter: new Prisma.Decimal('3.42857143'),
      stockValueBefore: new Prisma.Decimal(100),
      stockValueAfter: new Prisma.Decimal(120),
      unitCost: new Prisma.Decimal(4),
      totalCost: new Prisma.Decimal(20),
    };
    tx.inventoryMovement.findMany.mockResolvedValue([last, movement]);
    tx.inventoryMovement.findFirst.mockResolvedValue(last);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'balance',
        productLocationId: 'product-location-1',
        quantityOnHand: last.quantityAfter,
        averageUnitCost: last.averageUnitCostAfter,
        stockValue: last.stockValueAfter,
      },
    ]);
    tx.inventoryDocument.update.mockResolvedValue(
      document(InventoryDocumentStatus.VOIDED),
    );
    await service.changeDocumentStatus(
      'location-1',
      'document-1',
      InventoryDocumentTargetStatus.VOIDED,
      actor,
    );
    expect(tx.inventoryMovement.findFirst).toHaveBeenCalledOnce();
    const reversals = tx.inventoryMovement.create.mock.calls.map(
      ([args]) => args.data,
    );
    expect(reversals.map((value) => value.totalCost.toFixed(2))).toEqual([
      '-20.00',
      '-100.00',
    ]);
    expect(reversals[1].quantityBefore.toString()).toBe('30');
    expect(reversals[1].quantityAfter.toString()).toBe('0');
    expect(reversals[1].stockValueAfter.toFixed(2)).toBe('0.00');
  });

  it('transfers repeated product lines while preserving the exact total value between locations', async () => {
    const { service, tx, products } = setup(InventoryDocumentStatus.OPEN);
    const transfer = {
      ...document(InventoryDocumentStatus.OPEN),
      type: InventoryDocumentType.TRANSFER,
      destinationLocationId: 'location-2',
    };
    tx.inventoryDocument.findFirst.mockResolvedValue({
      ...transfer,
      items: [
        { ...transfer.items[0], quantity: new Prisma.Decimal(1) },
        { ...transfer.items[0], id: 'item-2', quantity: new Prisma.Decimal(2) },
      ],
    });
    products.resolveForInventory.mockResolvedValue([
      { id: 'destination', productId: 'product-1' },
    ]);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'source',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(3),
        averageUnitCost: new Prisma.Decimal('3.33333333'),
        stockValue: new Prisma.Decimal(10),
      },
      {
        id: 'target',
        productLocationId: 'destination',
        quantityOnHand: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(0),
        stockValue: new Prisma.Decimal(0),
      },
    ]);
    tx.inventoryDocument.update.mockResolvedValue({
      ...transfer,
      status: InventoryDocumentStatus.POSTED,
    });
    await service.changeDocumentStatus(
      'location-1',
      'document-1',
      InventoryDocumentTargetStatus.POSTED,
      actor,
    );
    expect(products.resolveForInventory).toHaveBeenCalledWith(
      'location-2',
      ['product-1'],
      tx,
    );
    const movements = tx.inventoryMovement.create.mock.calls.map(
      ([args]) => args.data,
    );
    expect(movements.map((value) => value.totalCost.toFixed(2))).toEqual([
      '-3.33',
      '3.33',
      '-6.67',
      '6.67',
    ]);
    expect(movements[2].stockValueAfter.toString()).toBe('0');
    expect(movements[3].stockValueAfter.toFixed(2)).toBe('10.00');
  });
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

  it('posts a document movement with an inventory document source', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.OPEN);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'balance-1',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        stockValue: new Prisma.Decimal('37.50'),
        averageUnitCost: new Prisma.Decimal('7.50'),
        updatedAt: new Date(),
      },
    ]);
    tx.inventoryBalance.update.mockResolvedValue({});
    tx.inventoryMovement.create.mockResolvedValue({});
    tx.inventoryDocument.update.mockResolvedValue({
      ...document(InventoryDocumentStatus.POSTED),
      status: InventoryDocumentStatus.POSTED,
    });

    await service.changeDocumentStatus(
      'location-1',
      'document-1',
      InventoryDocumentTargetStatus.POSTED,
      actor,
    );

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'document-1',
        sourceType: InventoryMovementSourceType.INVENTORY_DOCUMENT,
        sourceId: 'document-1',
        sourceLocationId: 'location-1',
        type: InventoryMovementType.WRITE_OFF,
      }),
    });
  });

  it('posts a tracked sale with a frozen weighted-average cost', async () => {
    const { service, tx } = setup(InventoryDocumentStatus.OPEN);
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'balance-1',
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        stockValue: new Prisma.Decimal('37.50'),
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
        stockValue: expect.objectContaining({}),
      },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        sourceType: InventoryMovementSourceType.ORDER,
        sourceId: 'order-1',
        sourceLocationId: 'location-1',
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
      totalCost: new Prisma.Decimal(-37.5),
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
        stockValue: new Prisma.Decimal('22.50'),
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
        sourceType: InventoryMovementSourceType.ORDER,
        sourceId: 'order-1',
        sourceLocationId: 'location-1',
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

  it.each([undefined, 'e0e8d4d1-cd3f-4b21-bc10-a1a48c2b0347'])(
    'counts documents by status for the same type and date filters with supplierId=%s',
    async (supplierId) => {
      const groupBy = vi.fn().mockResolvedValue([
        { status: InventoryDocumentStatus.OPEN, _count: { _all: 2 } },
        { status: InventoryDocumentStatus.POSTED, _count: { _all: 5 } },
      ]);
      const service = new InventoryService(
        { inventoryDocument: { groupBy } } as never,
        {} as never,
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
        supplierId,
      });

      expect(groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: {
          locationId: 'location-1',
          type: InventoryDocumentType.RECEIPT,
          status: undefined,
          supplierId,
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
    },
  );

  it('links an active supplier and stores its name snapshot when creating a document', async () => {
    const { service, db, products, suppliers } = setup(
      InventoryDocumentStatus.OPEN,
    );
    products.resolveForInventory.mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        product: {
          name: 'Shampoo',
          sku: 'SKU-1',
          unit: ProductUnit.PIECE,
        },
      },
    ]);
    suppliers.resolveActiveForDocument.mockResolvedValue({
      id: 'supplier-1',
      name: 'Acme Supply',
    });
    db.inventoryDocument.create.mockResolvedValue({
      id: 'document-1',
      supplierId: 'supplier-1',
      supplierName: 'Acme Supply',
    });

    await service.createDocument(
      'location-1',
      {
        type: InventoryDocumentType.RECEIPT,
        occurredAt: '2026-10-01T10:00:00.000Z',
        supplierId: 'supplier-1',
        items: [
          {
            productId: 'product-1',
            quantity: '2.000',
            unitCost: '5.00',
          },
        ],
      },
      actor,
    );

    expect(suppliers.resolveActiveForDocument).toHaveBeenCalledWith(
      'brand-1',
      'supplier-1',
      undefined,
    );
    expect(db.inventoryDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 'supplier-1',
          supplierName: 'Acme Supply',
        }),
      }),
    );
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
          supplierId: undefined,
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
        supplierId: undefined,
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

  it('filters inventory balances to products with no stock', async () => {
    const { service, db, products } = setup(InventoryDocumentStatus.OPEN);
    products.listTrackedForInventory = vi.fn().mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        reorderLevel: new Prisma.Decimal(2),
        product: {
          name: 'Shampoo',
          sku: 'SKU-1',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-2',
        productId: 'product-2',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Conditioner',
          sku: 'SKU-2',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-3',
        productId: 'product-3',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Mask',
          sku: 'SKU-3',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      {
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        averageUnitCost: new Prisma.Decimal(3),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      {
        productLocationId: 'product-location-2',
        quantityOnHand: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(4),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);

    const result = await service.searchInventory('location-1', {
      page: 1,
      pageSize: 10,
      outOfStock: true,
    } as never);

    expect(result.totalItems).toBe(2);
    expect(result.items.map((item) => item.productLocationId)).toEqual([
      'product-location-2',
      'product-location-3',
    ]);
    expect(result.items.every((item) => item.outOfStock)).toBe(true);
  });

  it('counts low-stock and out-of-stock inventory balances', async () => {
    const { service, db, products } = setup(InventoryDocumentStatus.OPEN);
    products.listTrackedForInventory = vi.fn().mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        reorderLevel: new Prisma.Decimal(2),
        product: {
          name: 'Shampoo',
          sku: 'SKU-1',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-2',
        productId: 'product-2',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Conditioner',
          sku: 'SKU-2',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-3',
        productId: 'product-3',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Mask',
          sku: 'SKU-3',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-4',
        productId: 'product-4',
        reorderLevel: new Prisma.Decimal(3),
        product: {
          name: 'Serum',
          sku: 'SKU-4',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      {
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        averageUnitCost: new Prisma.Decimal(3),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      {
        productLocationId: 'product-location-2',
        quantityOnHand: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(4),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      {
        productLocationId: 'product-location-4',
        quantityOnHand: new Prisma.Decimal(1),
        averageUnitCost: new Prisma.Decimal(5),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);

    const result = await service.getInventoryCounts('location-1', {});

    expect(result).toEqual({
      lowStockCount: 3,
      outOfStockCount: 2,
    });
  });

  it('filters inventory balances and counts by selected products', async () => {
    const { service, db, products } = setup(InventoryDocumentStatus.OPEN);
    products.listTrackedForInventory = vi.fn().mockResolvedValue([
      {
        id: 'product-location-1',
        productId: 'product-1',
        reorderLevel: new Prisma.Decimal(2),
        product: {
          name: 'Shampoo',
          sku: 'SKU-1',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-2',
        productId: 'product-2',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Conditioner',
          sku: 'SKU-2',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
      {
        id: 'product-location-3',
        productId: 'product-3',
        reorderLevel: new Prisma.Decimal(1),
        product: {
          name: 'Mask',
          sku: 'SKU-3',
          barcode: null,
          unit: ProductUnit.PIECE,
        },
      },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      {
        productLocationId: 'product-location-1',
        quantityOnHand: new Prisma.Decimal(5),
        averageUnitCost: new Prisma.Decimal(3),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      {
        productLocationId: 'product-location-2',
        quantityOnHand: new Prisma.Decimal(0),
        averageUnitCost: new Prisma.Decimal(4),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);

    const result = await service.searchInventory('location-1', {
      page: 1,
      pageSize: 10,
      productIds: ['product-1', 'product-3'],
    } as never);
    const counts = await service.getInventoryCounts('location-1', {
      productIds: ['product-1', 'product-3'],
    });

    expect(result.totalItems).toBe(2);
    expect(result.items.map((item) => item.productId)).toEqual([
      'product-3',
      'product-1',
    ]);
    expect(counts).toEqual({
      lowStockCount: 1,
      outOfStockCount: 1,
    });
  });
});
