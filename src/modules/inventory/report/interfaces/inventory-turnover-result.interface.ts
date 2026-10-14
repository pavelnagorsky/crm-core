import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { InventoryTurnoverLine } from './inventory-turnover-line.interface.js';

export interface InventoryTurnoverResult extends PaginatedResult<InventoryTurnoverLine> {
  totals: InventoryTurnoverLine;
}
