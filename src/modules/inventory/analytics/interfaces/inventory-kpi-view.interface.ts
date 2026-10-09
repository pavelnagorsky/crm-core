import { Prisma } from '@prisma/client';
import { InventoryReplenishmentItemView } from './inventory-replenishment-item-view.interface.js';

export interface InventoryKpiView {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockValue: Prisma.Decimal;
  deadStockCount: number;
  movingProductsCount: number;
  topReplenishmentItems: InventoryReplenishmentItemView[];
}
