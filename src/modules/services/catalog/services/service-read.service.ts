import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceStatus, StaffStatus } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BOOKING_SERVICE_SELECT } from '../constants/booking-catalog.select.js';
import { ServiceFilter } from '../interfaces/service-filter.interface.js';
import { ServiceForCatalog } from '../interfaces/service-for-catalog.interface.js';
import { ServiceWithImage } from '../interfaces/service-with-image.interface.js';
import { ServiceWithStaffCount } from '../interfaces/service-with-staff-count.interface.js';

const serviceViewInclude = {
  imageFile: true,
  _count: { select: { staffServices: true } },
} satisfies Prisma.ServiceInclude;

const serviceCatalogInclude = {
  imageFile: true,
  category: { select: { name: true } },
  _count: { select: { staffServices: true } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class ServiceReadService {
  constructor(private readonly db: DatabaseService) {}

  async findById(
    locationId: string,
    serviceId: string,
  ): Promise<ServiceWithStaffCount> {
    const service = await this.db.service.findUnique({
      where: { location: ACTIVE_LOCATION_WHERE, id: serviceId, locationId },
      include: serviceViewInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  listActiveForBooking(locationId: string) {
    return this.db.service.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        status: ServiceStatus.ACTIVE,
      },
      select: BOOKING_SERVICE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async resolveActiveForBooking(
    locationId: string,
    serviceIds: string[],
  ): Promise<ServiceWithImage[]> {
    const uniqueIds = [...new Set(serviceIds)];
    const services = await this.db.service.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: { in: uniqueIds },
        locationId,
        status: ServiceStatus.ACTIVE,
      },
      include: { imageFile: true },
    });
    if (services.length !== uniqueIds.length) {
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const byId = new Map(services.map((service) => [service.id, service]));
    return serviceIds.map((serviceId) => byId.get(serviceId)!);
  }

  async resolveCatalogEntries(
    locationId: string,
    ids: string[],
    tx: Prisma.TransactionClient,
  ): Promise<ServiceForCatalog[]> {
    if (ids.length === 0) return [];
    return tx.service.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, locationId, id: { in: ids } },
      include: serviceCatalogInclude,
    });
  }

  async assertIdsInLocation(locationId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.db.service.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        id: { in: unique },
      },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new AppException(
        ErrorCode.COMPENSATION_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async findIdsByFilter(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<string[]> {
    const rows = await this.db.service.findMany({
      where: this.buildFilterWhere(locationId, filter),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private buildFilterWhere(
    locationId: string,
    filter: ServiceFilter,
  ): Prisma.ServiceWhereInput {
    const where: Prisma.ServiceWhereInput = {
      location: ACTIVE_LOCATION_WHERE,
      locationId,
    };
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
        {
          category: { description: { contains: search, mode: 'insensitive' } },
        },
      ];
    }
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.status !== undefined) where.status = filter.status;
    return where;
  }

  async countBookable(locationId: string): Promise<number> {
    return this.db.service.count({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        status: ServiceStatus.ACTIVE,
        staffServices: { some: { staff: { status: StaffStatus.ACTIVE } } },
      },
    });
  }
}
