import { Prisma, ServiceStatus } from '@prisma/client';

/** A service of the price catalog, in any status. */
export interface ServicePriceCatalogService {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  price: Prisma.Decimal;
  categoryId: string | null;
  sortOrder: number;
  status: ServiceStatus;
}
