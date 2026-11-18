import { ProductPurpose } from '../../../products/enums/product-purpose.enum.js';
import { InventoryTurnoverLine } from './inventory-turnover-line.interface.js';

export interface InventoryTurnoverView {
  locationName: string;
  currency: string;
  timezone: string;
  from: string;
  to: string;
  purpose: ProductPurpose | null;
  lines: InventoryTurnoverLine[];
}
