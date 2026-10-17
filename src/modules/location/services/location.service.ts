import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Location, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { resolveLocationLocale } from '../../../shared/geo/resolve-location-locale.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { BookingDeletionPolicyService } from '../../bookings/deletion-policy/services/booking-deletion-policy.service.js';
import { BrandService } from '../../brand/services/brand.service.js';
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
  ) {}

  async create(brandId: string, dto: CreateLocationDto): Promise<Location> {
    const locale = resolveLocationLocale(dto);
    await this.brandService.findById(brandId);
    const location = await this.db.location.create({
      data: { ...dto, ...locale, brandId },
    });
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
    const location = await this.db.location.findUnique({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      include: { brand: { include: { logoFile: true } } },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async update(
    locationId: string,
    dto: UpdateLocationDto,
    rawBody: Record<string, unknown>,
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
    await this.findById(locationId);
    return this.db.location.update({
      where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
      data: dto,
    });
  }

  async delete(locationId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.location.updateMany({
        where: { id: locationId, ...ACTIVE_LOCATION_WHERE },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Location not found');
      await this.bookingDeletionPolicy.assertLocationDeletionAllowed(
        locationId,
        tx,
      );
    });
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
