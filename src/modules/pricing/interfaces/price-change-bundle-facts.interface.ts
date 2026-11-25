import { ServiceStatus } from '@prisma/client';

/** A FIXED bundle in the scope of a price change with its stored price (minor units). */
export interface PriceChangeBundleFacts {
  id: string;
  title: string;
  categoryId: string | null;
  status: ServiceStatus;
  sortOrder: number;
  price: number;
}
