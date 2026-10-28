import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BOOKING_BUNDLE_SELECT } from '../constants/booking-catalog.select.js';
import { ServiceBundleForCatalog } from '../interfaces/service-bundle-for-catalog.interface.js';
import { ServiceBundleView } from '../interfaces/service-bundle-view.interface.js';

const serviceBundleInclude = {
  imageFile: true,
  category: { select: { name: true } },
  items: { orderBy: { sortOrder: 'asc' as const }, include: { service: true } },
};

const serviceBundleCatalogInclude = {
  imageFile: true,
  category: { select: { name: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      service: {
        select: {
          title: true,
          price: true,
          durationMinutes: true,
          bufferMinutes: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceBundleInclude;

@Injectable()
export class ServiceBundleReadService {
  constructor(private readonly db: DatabaseService) {}

  async findById(
    locationId: string,
    bundleId: string,
  ): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findUnique({
      where: { location: ACTIVE_LOCATION_WHERE, id: bundleId, locationId },
      include: serviceBundleInclude,
    });
    if (!bundle) throw new NotFoundException('Service bundle not found');
    return bundle;
  }

  listActiveForBooking(locationId: string) {
    return this.db.serviceBundle.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        status: ServiceStatus.ACTIVE,
      },
      select: BOOKING_BUNDLE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async resolveActiveForBooking(
    locationId: string,
    bundleId: string,
  ): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: bundleId,
        locationId,
        status: ServiceStatus.ACTIVE,
      },
      include: serviceBundleInclude,
    });
    if (!bundle) {
      throw new AppException(
        ErrorCode.BOOKING_BUNDLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return bundle;
  }

  async resolveCatalogEntries(
    locationId: string,
    ids: string[],
    tx: Prisma.TransactionClient,
  ): Promise<ServiceBundleForCatalog[]> {
    if (ids.length === 0) return [];
    return tx.serviceBundle.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, locationId, id: { in: ids } },
      include: serviceBundleCatalogInclude,
    });
  }
}
