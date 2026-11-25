import { ServiceStatus } from '@prisma/client';

/** A service in the scope of a price change with the prices stored now (minor units). */
export interface PriceChangeServiceFacts {
  id: string;
  title: string;
  categoryId: string | null;
  status: ServiceStatus;
  sortOrder: number;
  price: number;
  /** Own price per non-default level id. */
  levelPrices: Record<string, number>;
  /** Active staff assigned to the service, personal price or null. */
  staff: { staffId: string; name: string; price: number | null }[];
}
