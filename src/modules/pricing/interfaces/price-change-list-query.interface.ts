import { PriceChangeStatus } from '@prisma/client';

/** A page of the price change history. */
export interface PriceChangeListQuery {
  page: number;
  pageSize: number;
  status?: PriceChangeStatus;
}
