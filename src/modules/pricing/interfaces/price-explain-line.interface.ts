import { PriceAdjustment } from '../engine/interfaces/price-adjustment.interface.js';

/** Price layers of the visit; a bundle is summed over its lines. Minor units. */
export interface PriceExplainLine {
  basePrice: number;
  staffPrice: number;
  adjustments: PriceAdjustment[];
  listPrice: number;
  /** The discount layer of adjustments (summed over a bundle), or null. */
  discount: PriceAdjustment | null;
  /** List price minus the discount. */
  chargedPrice: number;
  total: number;
}
