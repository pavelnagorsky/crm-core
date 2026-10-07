import { ProductUnit } from '@prisma/client';

export interface InventorySaleLine {
  orderItemId: string;
  productLocationId: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productUnit: ProductUnit;
  quantity: string;
  trackInventory: boolean;
}
