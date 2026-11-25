import { ServicePriceImportItemType } from '../enums/service-price-import-item-type.enum.js';

/** Prices the file sets for an existing service or bundle. */
export interface ServicePriceEdit {
  row: number;
  type: ServicePriceImportItemType;
  id: string;
  /** Null: the base price cell is empty, the price stays. */
  basePrice: string | null;
  /** One entry per level column of the file; null removes the level price. */
  levelPrices: { levelId: string; price: string | null }[];
}
