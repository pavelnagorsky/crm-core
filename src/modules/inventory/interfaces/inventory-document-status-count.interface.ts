import { InventoryDocumentStatus } from '../enums/inventory-document-status.enum.js';

export interface InventoryDocumentStatusCount {
  status: InventoryDocumentStatus;
  count: number;
}
