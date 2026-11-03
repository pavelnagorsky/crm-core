import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Location, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { resolveLocationLocale } from '../../../shared/geo/resolve-location-locale.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { BookingDeletionPolicyService } from '../../bookings/deletion-policy/services/booking-deletion-policy.service.js';
import { BrandService } from '../../brand/services/brand.service.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { LOCATION_AUDIT_FIELDS } from '../../audit/fields/location.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import {
  LOCATION_SETTINGS_CACHE,
  LOCATION_SETTINGS_SELECT,
} from '../cache/location-settings.cache.js';
import { CreateLocationDto } from '../dto/create-location.dto.js';
import { UpdateLocationDto } from '../dto/update-location.dto.js';
import { LocationPublicProfile } from '../interfaces/location-public-profile.interface.js';

@Injectable()
export class LocationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly brandService: BrandService,
    private readonly tokenEpochRegistry: TokenEpochRegistryService,
    private readonly bookingDeletionPolicy: BookingDeletionPolicyService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    brandId: string,
    dto: CreateLocationDto,
    actor: AuditActor,
  ): Promise<Location> {
    const locale = resolveLocationLocale(dto);
    await this.brandService.findById(brandId);
    const location = await this.db.location.create({
      data: { ...dto, ...locale, brandId },
    });
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId: location.id,
      entityType: AuditEntity.LOCATION,
      entityId: location.id,
      eventType: AuditEvent.LOCATION_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: { name: location.name },
    } satisfies AuditLogEvent);
    await this.tokenEpochRegistry.bumpMany(
      await this.brandService.findMemberUserIds(brandId),
    );
    return location;
  }

  async listByBrand(brandId: string): Promise<Location[]> {
    return this.db.location.findMany({
      where: { brandId, ...ACTIVE_LOCATION_WHERE },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(
    locationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Location> {
    const location = await (tx ?? this.db).location.findUnique({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async findPublicProfile(locationId: string): Promise<LocationPublicProfile> {
    const location = await this.getBookingSettings(locationId);
    const brand = await this.brandService.findPublicProfile(location.brandId);
    return { ...location, brand };
  }

  getBookingSettings(locationId: string) {
    return this.cache.getOrLoad(LOCATION_SETTINGS_CACHE, { locationId }, () =>
      this.loadBookingSettings(locationId),
    );
  }

  private async loadBookingSettings(locationId: string) {
    const location = await this.db.location.findUnique({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      select: LOCATION_SETTINGS_SELECT,
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async update(
    locationId: string,
    dto: UpdateLocationDto,
    rawBody: Record<string, unknown>,
    actor: AuditActor,
  ): Promise<Location> {
    if (
      'countryCode' in rawBody ||
      'currency' in rawBody ||
      'timezone' in rawBody
    ) {
      throw new AppException(
        ErrorCode.LOCATION_ANCHORS_IMMUTABLE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const old = await this.findById(locationId);
    const updated = await this.db.location.update({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      data: dto,
    });
    await this.cache.invalidate(CacheDependency.locationSettings(locationId));
    await this.cache.invalidate(CacheDependency.staffSchedule(locationId));
    const changes = diffFields(old, updated, LOCATION_AUDIT_FIELDS);
    if (changes.length > 0) {
      this.eventEmitter.emit(AUDIT_EVENT, {
        brandId: updated.brandId,
        locationId,
        entityType: AuditEntity.LOCATION,
        entityId: locationId,
        eventType: AuditEvent.LOCATION_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes },
      } satisfies AuditLogEvent);
    }
    return updated;
  }

  async delete(locationId: string, actor: AuditActor): Promise<void> {
    const location = await this.db.$transaction(async (tx) => {
      const { count } = await tx.location.updateMany({
        where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Location not found');
      await this.bookingDeletionPolicy.assertLocationDeletionAllowed(
        locationId,
        tx,
      );
      return tx.location.findUniqueOrThrow({ where: { id: locationId } });
    });
    await this.cache.invalidate(CacheDependency.locationLifecycle(locationId));
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId: location.brandId,
      locationId,
      entityType: AuditEntity.LOCATION,
      entityId: locationId,
      eventType: AuditEvent.LOCATION_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { name: location.name },
    } satisfies AuditLogEvent);
  }

  async acquireActiveOperationLock(
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const location = await tx.location.findUnique({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      select: { brandId: true },
    });
    if (
      !location ||
      !(await this.brandService.acquireActiveOperationLock(
        location.brandId,
        tx,
      ))
    ) {
      return false;
    }
    const rows = await tx.$queryRaw<Pick<Location, 'id'>[]>`
      SELECT "id" FROM "Location"
      WHERE "id" = ${locationId} AND "deletedAt" IS NULL
      FOR SHARE
    `;
    return rows.length > 0;
  }

  async getAutomaticProcessingCutoffs(
    locationIds: string[],
  ): Promise<Map<string, Date | null>> {
    if (locationIds.length === 0) return new Map();
    const rows = await this.db.location.findMany({
      where: { id: { in: locationIds }, ...ACTIVE_LOCATION_WHERE },
      select: {
        id: true,
        restoredAt: true,
        brand: { select: { restoredAt: true } },
      },
    });
    return new Map(
      rows.map((row) => {
        const dates = [row.restoredAt, row.brand.restoredAt].filter(
          (date): date is Date => date !== null,
        );
        return [
          row.id,
          dates.length
            ? new Date(Math.max(...dates.map((date) => date.getTime())))
            : null,
        ];
      }),
    );
  }

  async getLocale(
    locationId: string,
  ): Promise<{ timezone: string; currency: string }> {
    const location = await this.db.location.findUnique({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      select: { timezone: true, currency: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async getLocalesByIds(
    locationIds: string[],
  ): Promise<Map<string, { timezone: string; currency: string }>> {
    if (locationIds.length === 0) return new Map();
    const rows = await this.db.location.findMany({
      where: { id: { in: locationIds }, ...ACTIVE_LOCATION_WHERE },
      select: { id: true, timezone: true, currency: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { timezone: row.timezone, currency: row.currency },
      ]),
    );
  }
}
