import { InventoryReportMovement } from './inventory-report-movement.interface.js';
import { InventoryTurnoverLine } from './inventory-turnover-line.interface.js';

export interface InventoryReportView {
  locationName: string;
  currency: string;
  timezone: string;
  from: string;
  to: string;
  lines: InventoryTurnoverLine[];
  movements: InventoryReportMovement[];
}
