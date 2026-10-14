import { InventoryTurnoverLine } from './inventory-turnover-line.interface.js';

export interface InventoryTurnoverView {
  locationName: string;
  currency: string;
  timezone: string;
  from: string;
  to: string;
  lines: InventoryTurnoverLine[];
}
