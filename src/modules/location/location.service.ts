import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Location } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { COUNTRY_DEFAULTS } from '../../shared/geo/country-defaults.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { TokenEpochRegistryService } from '../auth/token-epoch-registry.service.js';
import { BrandService } from '../brand/brand.service.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationPublicProfile } from './interfaces/location-public-profile.interface.js';

@Injectable()
export class LocationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly brandService: BrandService,
    private readonly tokenEpochRegistry: TokenEpochRegistryService,
  ) {}

  async create(brandId: string, dto: CreateLocationDto): Promise<Location> {
    this.validateLocationAnchors(dto);
    const location = await this.db.location.create({
      data: { ...dto, brandId },
    });
    await this.tokenEpochRegistry.bumpMany(
      await this.brandService.findMemberUserIds(brandId),
    );
    return location;
  }

  async listByBrand(brandId: string): Promise<Location[]> {
    return this.db.location.findMany({
      where: { brandId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(locationId: string): Promise<Location> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async findPublicProfile(locationId: string): Promise<LocationPublicProfile> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
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
      where: { id: locationId },
      data: dto,
    });
  }

  async delete(locationId: string): Promise<void> {
    await this.db.location.delete({ where: { id: locationId } });
  }

  async getLocale(
    locationId: string,
  ): Promise<{ timezone: string; currency: string }> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
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

  private validateLocationAnchors(dto: CreateLocationDto): void {
    const country =
      COUNTRY_DEFAULTS[
        dto.countryCode.toUpperCase() as keyof typeof COUNTRY_DEFAULTS
      ];
    if (!country) throw new BadRequestException('Unsupported country code');
    if (country.currency !== dto.currency.toUpperCase()) {
      throw new BadRequestException('Currency does not match country default');
    }
    if (!(country.timezones as readonly string[]).includes(dto.timezone)) {
      throw new BadRequestException('Timezone is not valid for country');
    }
  }
}
