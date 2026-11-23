import { PriceLevelMatrixCategory } from './price-level-matrix-category.interface.js';
import { PriceLevelView } from './price-level-view.interface.js';

/** Level prices of every active service, by category. */
export interface PriceLevelMatrix {
  levels: PriceLevelView[];
  categories: PriceLevelMatrixCategory[];
}
