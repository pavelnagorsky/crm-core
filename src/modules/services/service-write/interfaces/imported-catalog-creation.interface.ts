import { Service, ServiceCategory } from '@prisma/client';

/** What a price file created, for the audit and cache work after the commit. */
export interface ImportedCatalogCreation {
  categories: ServiceCategory[];
  /** In the order of the input. */
  services: { service: Service; categoryName: string | null }[];
}
