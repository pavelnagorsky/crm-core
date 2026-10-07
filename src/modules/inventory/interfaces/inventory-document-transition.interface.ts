import { InventoryDocumentWithItems } from './inventory-document-with-items.interface.js';

export interface InventoryDocumentTransition {
  document: InventoryDocumentWithItems;
  changed: boolean;
}
