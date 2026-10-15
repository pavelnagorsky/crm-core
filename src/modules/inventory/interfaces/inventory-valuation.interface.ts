import { Prisma } from '@prisma/client';
import { InventoryState } from './inventory-state.interface.js';

export interface InventoryValuation extends InventoryState {
  totalCost: Prisma.Decimal;
}
