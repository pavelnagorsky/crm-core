import { PriceAdjustment } from './price-adjustment.interface.js';

/** Staff price of a line and the layer that moved it from the base price, if any. */
export interface StaffPriceLayer {
  price: number;
  adjustment: PriceAdjustment | null;
}
