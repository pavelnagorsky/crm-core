import { Injectable, NotFoundException } from '@nestjs/common';
import { Brand, BusinessRole, Prisma, UserRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { UserService } from '../user/user.service.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { BUSINESS_AUDIT_FIELDS } from '../audit/fields/business.fields.js';
import { BusinessSearchOrderBy } from './enums/search-order-by.enum.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';
import { BusinessSearchRequestDto } from './dto/business-search-request.dto.js';
import { BusinessWithCounts } from './interfaces/business-with-counts.interface.js';
import { BusinessWithLogo } from './interfaces/business-with-logo.interface.js';

@Injectable()
export class BusinessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    userId: string,
    dto: CreateBusinessDto,
    actor: AuditActor,
  ): Promise<Brand> {
    const user = await this.userService.findById(userId);
    const staffName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      'Owner';

    const brand = await this.db.brand.create({
      data: {
        name: dto.name,
        logoFileId: dto.logoFileId ?? null,
        brandMemberships: { create: { userId, role: BusinessRole.OWNER } },
        locations: {
          create: {
            name: dto.name,
            countryCode: 'US',
            currency: dto.currency,
            timezone: dto.timezone,
            advanceBookingWindowDays: dto.advanceBookingWindowDays,
            slotIntervalMinutes: dto.slotIntervalMinutes,
            minimumBookingNoticeMinutes: dto.minimumBookingNoticeMinutes,
            bookingVisibility: dto.bookingVisibility,
            isBookingConfirmationRequired: dto.isBookingConfirmationRequired,
            locationMemberships: {
              create: { userId, role: BusinessRole.OWNER },
            },
            staff: {
              create: {
                userId,
                name: staffName,
                phone: user.phone,
                email: user.email,
              },
            },
          },
        },
      },
      include: { locations: { include: { staff: true } } },
    });

    const ownerStaff = brand.locations[0]?.staff[0];
    if (ownerStaff) {
      this.eventEmitter.emit(AUDIT_EVENT, {
        brandId: brand.id,
        locationId: ownerStaff.locationId,
        entityType: AuditEntity.STAFF,
        entityId: ownerStaff.id,
        eventType: AuditEvent.STAFF_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt: new Date(),
        actor,
        payload: { name: ownerStaff.name },
      } satisfies AuditLogEvent);
    }

    return brand;
  }

  async update(
    brandId: string,
    dto: UpdateBusinessDto,
    actor: AuditActor,
  ): Promise<Brand> {
    const old = await this.findById(brandId);
    const brand = await this.db.brand.update({
      where: { id: brandId },
      data: { name: dto.name, logoFileId: dto.logoFileId },
    });
    const changes = diffFields(old, brand, BUSINESS_AUDIT_FIELDS);
    if (changes.length > 0) {
      this.eventEmitter.emit(AUDIT_EVENT, {
        brandId,
        entityType: AuditEntity.BRAND,
        entityId: brandId,
        eventType: AuditEvent.BRAND_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes },
      } satisfies AuditLogEvent);
    }
    return brand;
  }

  async findById(brandId: string): Promise<BusinessWithLogo> {
    const brand = await this.db.brand.findUnique({
      where: { id: brandId },
      include: {
        logoFile: true,
        locations: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    if (!brand) return this.findByLocationId(brandId);
    const location = brand.locations[0];
    return { ...brand, ...location };
  }

  async findByLocationId(locationId: string): Promise<BusinessWithLogo> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
      include: { brand: { include: { logoFile: true } } },
    });
    if (!location) throw new NotFoundException('Location not found');
    const { brand, ...locationFields } = location;
    return { ...brand, ...locationFields };
  }

  async getLocale(
    locationId: string,
  ): Promise<{ timezone: string; currency: string }> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
      select: { timezone: true, currency: true },
    });
    if (location) return location;

    const brand = await this.db.brand.findUnique({
      where: { id: locationId },
      select: {
        locations: { select: { timezone: true, currency: true }, take: 1 },
      },
    });
    const fallback = brand?.locations[0];
    if (!fallback) throw new NotFoundException('Location not found');
    return fallback;
  }

  async getLocalesByIds(
    locationIds: string[],
  ): Promise<Map<string, { timezone: string; currency: string }>> {
    if (locationIds.length === 0) return new Map();
    const rows = await this.db.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, timezone: true, currency: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { timezone: row.timezone, currency: row.currency },
      ]),
    );
  }

  async search(
    payload: TokenPayloadDto,
    dto: BusinessSearchRequestDto,
  ): Promise<BusinessWithCounts[]> {
    const where: Prisma.BrandWhereInput = {};
    if (payload.role !== UserRole.ADMIN) {
      where.brandMemberships = { some: { userId: payload.sub } };
    }
    if (dto.search) where.name = { contains: dto.search, mode: 'insensitive' };
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    return this.db.brand.findMany({
      where,
      orderBy: {
        [dto.orderBy ?? BusinessSearchOrderBy.CREATED_AT]:
          dto.orderDirection ?? OrderDirection.DESC,
      },
      include: {
        logoFile: true,
        brandMemberships: {
          where: { userId: payload.sub },
          select: { role: true },
        },
        _count: { select: { locations: true, clients: true } },
      },
    });
  }

  async delete(brandId: string): Promise<void> {
    await this.db.brand.delete({ where: { id: brandId } });
  }
}
