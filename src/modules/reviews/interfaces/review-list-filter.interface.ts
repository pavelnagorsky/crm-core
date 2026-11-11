import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { ReviewSearchOrderBy } from '../enums/review-search-order-by.enum.js';

export interface ReviewListFilter {
  page: number;
  pageSize: number;
  staffId?: string;
  rating?: number;
  orderBy?: ReviewSearchOrderBy;
  orderDirection?: OrderDirection;
}
