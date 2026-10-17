import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Brand, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import {
  ACTIVE_BRAND_WHERE,
  ACTIVE_LOCATION_WHERE,
} from '../../../shared/database/active-business.where.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { resolveLocationLocale } from '../../../shared/geo/resolve-location-locale.js';
import { AccessService } from '../../access/services/access.service.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { BUSINESS_AUDIT_FIELDS } from '../../audit/fields/business.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { BookingDeletionPolicyService } from '../../bookings/deletion-policy/services/booking-deletion-policy.service.js';
import { UserService } from '../../user/services/user.service.js';
import { BrandSearchRequestDto } from '../dto/brand-search-request.dto.js';
import { CreateBrandDto } from '../dto/create-brand.dto.js';
import { UpdateBrandDto } from '../dto/update-brand.dto.js';
import { BrandSearchOrderBy } from '../enums/brand-search-order-by.enum.js';
import { BrandSearchScope } from '../interfaces/brand-search-scope.interface.js';
import { BrandWithCounts } from '../interfaces/brand-with-counts.interface.js';
import { BrandWithLogo } from '../interfaces/brand-with-logo.interface.js';

@Injectable()
export class BrandService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly tokenEpochRegistry: TokenEpochRegistryService,
    private readonly bookingDeletionPolicy: BookingDeletionPolicyService,
    private readonly access: AccessService,
  ) {}

  async create(
    userId: string,
    dto: CreateBrandDto,
    actor: AuditActor,
  ): Promise<Brand> {
    const locale = resolveLocationLocale(dto.location);
    const user = await this.userService.findById(userId);
    const staffName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      'Owner';

    const brand = await this.db.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name: dto.name,
          logoFileId: dto.logoFileId ?? null,
          locations: {
            create: {
              ...dto.location,
              ...locale,
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
      await this.access.assignInitialOwner(brand.id, userId, tx);
      await this.tokenEpochRegistry.bump(userId, tx);
      return brand;
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
    dto: UpdateBrandDto,
    actor: AuditActor,
  ): Promise<Brand> {
    const old = await this.findById(brandId);
    const brand = await this.db.brand.update({
      where: { id: brandId, ...ACTIVE_BRAND_WHERE },
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

  async findById(brandId: string): Promise<BrandWithLogo> {
    const brand = await this.db.brand.findUnique({
      where: { id: brandId, ...ACTIVE_BRAND_WHERE },
      include: { logoFile: true },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async search(
    dto: BrandSearchRequestDto,
    scope: BrandSearchScope,
  ): Promise<BrandWithCounts[]> {
    const where: Prisma.BrandWhereInput = { ...ACTIVE_BRAND_WHERE };
    if (scope.brandIds !== null) where.id = { in: scope.brandIds };
    if (dto.search) where.name = { contains: dto.search, mode: 'insensitive' };
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    return this.db.brand.findMany({
      where,
      orderBy: {
        [dto.orderBy ?? BrandSearchOrderBy.CREATED_AT]:
          dto.orderDirection ?? OrderDirection.DESC,
      },
      include: {
        logoFile: true,
        _count: {
          select: {
            locations: {
              where: {
                ...ACTIVE_LOCATION_WHERE,
                ...(scope.locationIds === null
                  ? {}
                  : {
                      id: {
                        in: scope.locationIds,
                      },
                    }),
              },
            },
            clients: true,
          },
        },
      },
    });
  }

  async delete(brandId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.brand.updateMany({
        where: { id: brandId, ...ACTIVE_BRAND_WHERE },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Brand not found');
      await this.bookingDeletionPolicy.assertBrandDeletionAllowed(brandId, tx);
    });
  }

  async acquireActiveOperationLock(
    brandId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Pick<Brand, 'id'>[]>`
      SELECT "id" FROM "Brand"
      WHERE "id" = ${brandId} AND "deletedAt" IS NULL
      FOR SHARE
    `;
    return rows.length > 0;
  }

  async findMemberUserIds(brandId: string): Promise<string[]> {
    return this.access.memberUserIds(brandId);
  }
}
