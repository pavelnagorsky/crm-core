import { PriceAdjustment } from '../engine/interfaces/price-adjustment.interface.js';

/** Price layers of the visit; a bundle is summed over its lines. Minor units. */
export interface PriceExplainLine {
  basePrice: number;
  staffPrice: number;
  adjustments: PriceAdjustment[];
  listPrice: number;
  total: number;
}
