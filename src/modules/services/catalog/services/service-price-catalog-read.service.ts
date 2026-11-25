import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { ServicePriceCatalog } from '../interfaces/service-price-catalog.interface.js';

@Injectable()
export class ServicePriceCatalogReadService {
  constructor(private readonly db: DatabaseService) {}

  /** Categories, services and bundles of the location in any status, in display order. */
  async load(
    locationId: string,
    db: Prisma.TransactionClient = this.db,
  ): Promise<ServicePriceCatalog> {
    const where = { location: ACTIVE_LOCATION_WHERE, locationId };
    const [categories, services, bundles] = await Promise.all([
      db.serviceCategory.findMany({
        where,
        select: { id: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
      db.service.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
          price: true,
          categoryId: true,
          sortOrder: true,
          status: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      }),
      db.serviceBundle.findMany({
        where,
        select: {
          id: true,
          title: true,
          categoryId: true,
          sortOrder: true,
          pricingMode: true,
          fixedPrice: true,
          status: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { categories, services, bundles };
  }
}
