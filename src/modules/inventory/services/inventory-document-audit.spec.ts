import { Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryDocumentTargetStatus } from '../enums/inventory-document-target-status.enum.js';
import { InventoryDocumentService } from './inventory-document.service.js';

describe('Inventory document audit', () => {
  const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
  const document: InventoryDocumentWithItems = {
    id: 'document',
    locationId: 'source',
    destinationLocationId: 'destination',
    supplierId: null,
    supplierName: null,
    type: 'TRANSFER',
    status: 'OPEN',
    occurredAt: new Date('2026-11-04'),
    reference: 'TR-1',
    reason: null,
    note: null,
    createdById: actor.id,
    createdByName: actor.name,
    postedAt: null,
    voidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item',
        documentId: 'document',
        productLocationId: 'source-product',
        productId: 'product',
        productName: 'Shampoo',
        productSku: null,
        productUnit: 'PIECE',
        quantity: new Prisma.Decimal(2),
        unitCost: new Prisma.Decimal(5),
        totalCost: new Prisma.Decimal(10),
        packagingId: null,
        packagingName: null,
        packagingFactor: null,
        packageQuantity: null,
        packageUnitCost: null,
        position: 0,
        createdAt: new Date(),
      },
    ],
  };
  const tx = {
    $queryRaw: vi.fn(),
    inventoryDocument: { findFirst: vi.fn(), update: vi.fn() },
    inventoryDocumentItem: { deleteMany: vi.fn() },
  };
  const db = { $transaction: vi.fn() };
  const drafts = { prepare: vi.fn() };
  const events = { emit: vi.fn() };
  const movements = { applyDocumentMovement: vi.fn() };
  const locations = { findById: vi.fn(), acquireActiveOperationLock: vi.fn() };
  const products = { resolveForInventory: vi.fn() };
  const locks = { lock: vi.fn() };
  const service = new InventoryDocumentService(
    db as never,
    products as never,
    drafts as never,
    locations as never,
    events as never,
    {} as never,
    locks as never,
    movements as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    locations.findById.mockResolvedValue({ id: 'source', brandId: 'brand' });
    locations.acquireActiveOperationLock.mockResolvedValue(true);
    tx.inventoryDocument.findFirst.mockResolvedValue(document);
    db.$transaction.mockImplementation(async (operation) => {
      const result = await operation(tx);
      expect(events.emit).not.toHaveBeenCalled();
      return result;
    });
  });

  it('retains item quantities and costs when the item count is unchanged', async () => {
    const updated = {
      ...document,
      items: [
        {
          ...document.items[0],
          quantity: new Prisma.Decimal(3),
          totalCost: new Prisma.Decimal(15),
        },
      ],
    };
    drafts.prepare.mockResolvedValue({
      supplierId: null,
      supplierName: null,
      items: updated.items,
    });
    tx.inventoryDocument.update.mockResolvedValue(updated);
    await service.updateDocument(
      document,
      {
        type: 'TRANSFER',
        occurredAt: '2026-11-04',
        destinationLocationId: 'destination',
        reference: 'TR-1',
        items: [{ productId: 'product', quantity: '3' }],
      },
      actor,
    );
    const audit = events.emit.mock.calls[0][1];
    const items = audit.payload.changes.find(
      (change: { field: string }) => change.field === 'items',
    );
    expect(items.from).toContain('"quantity":"2"');
    expect(items.to).toContain('"quantity":"3"');
    expect(items.to).toContain('"totalCost":"15"');
    expect(audit.payload.itemCount).toBe(1);
  });

  it('records a posted transfer in both locations after the transaction commits', async () => {
    products.resolveForInventory.mockResolvedValue([
      { id: 'destination-product', productId: 'product' },
    ]);
    locks.lock.mockResolvedValue(
      new Map([
        ['source-product', { averageUnitCost: new Prisma.Decimal(5) }],
        ['destination-product', {}],
      ]),
    );
    movements.applyDocumentMovement.mockResolvedValue({
      totalCost: new Prisma.Decimal(-10),
    });
    tx.inventoryDocument.update.mockResolvedValue({
      ...document,
      status: 'POSTED',
    });
    await service.changeDocumentStatus(
      document,
      InventoryDocumentTargetStatus.POSTED,
      actor,
    );
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand',
        locationId: 'source',
        entityId: 'document',
        eventType: 'INVENTORY_DOCUMENT_POSTED',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand',
        locationId: 'destination',
        entityId: 'document',
        eventType: 'INVENTORY_DOCUMENT_POSTED',
        payload: expect.objectContaining({
          transferDirection: 'IN',
          sourceLocationId: 'source',
        }),
      }),
    );
  });

  it('does not publish document changes when the update rolls back', async () => {
    drafts.prepare.mockResolvedValue({
      supplierId: null,
      supplierName: null,
      items: document.items,
    });
    tx.inventoryDocument.update.mockRejectedValue(new Error('Save failed'));
    await expect(
      service.updateDocument(
        document,
        {
          type: 'TRANSFER',
          occurredAt: '2026-11-04',
          destinationLocationId: 'destination',
          items: [{ productId: 'product', quantity: '2' }],
        },
        actor,
      ),
    ).rejects.toThrow('Save failed');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
