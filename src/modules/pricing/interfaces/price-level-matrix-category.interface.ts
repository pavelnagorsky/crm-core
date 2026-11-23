import { PriceLevelMatrixRow } from './price-level-matrix-row.interface.js';

export interface PriceLevelMatrixCategory {
  /** Null: services without a category. */
  id: string | null;
  name: string;
  services: PriceLevelMatrixRow[];
}
