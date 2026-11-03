import { auditSnapshot } from '../../audit/utils/audit-snapshot.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';

export function inventoryDocumentAudit(
  document: InventoryDocumentWithItems,
): Record<string, string | null> {
  return auditSnapshot(
    {
      ...document,
      items: document.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productUnit: item.productUnit,
        quantity: item.quantity.toString(),
        unitCost: item.unitCost?.toString() ?? null,
        totalCost: item.totalCost?.toString() ?? null,
        packagingName: item.packagingName,
        packagingFactor: item.packagingFactor?.toString() ?? null,
        packageQuantity: item.packageQuantity?.toString() ?? null,
        packageUnitCost: item.packageUnitCost?.toString() ?? null,
      })),
    },
    [
      'type',
      'destinationLocationId',
      'supplierId',
      'supplierName',
      'occurredAt',
      'reference',
      'reason',
      'note',
      'items',
    ] as const satisfies readonly (keyof InventoryDocumentWithItems)[],
  );
}
