import { ProductStatus } from '../enums/product-status.enum.js';

export interface ProductStatusCount {
  status: ProductStatus;
  count: number;
}
