import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceLevel } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ServiceLevelPriceRow } from '../interfaces/service-level-price-row.interface.js';

/** Reads the price levels and the level prices, the tables the pricing module owns. */
@Injectable()
export class PriceLevelReadService {
  constructor(private readonly db: DatabaseService) {}

  /** Levels of the location, the default one included, in display order. */
  listLevels(locationId: string): Promise<PriceLevel[]> {
    return this.db.priceLevel.findMany({
      where: { locationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** The level of the location, or a 404 when it is missing or belongs to another location. */
  async findLevel(locationId: string, levelId: string): Promise<PriceLevel> {
    const level = await this.db.priceLevel.findFirst({
      where: { id: levelId, locationId },
    });
    if (!level)
      throw new AppException(
        ErrorCode.PRICE_LEVEL_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return level;
  }

  /** Prices of one service for the non-default levels that have one. */
  listLevelPricesForService(
    serviceId: string,
  ): Promise<ServiceLevelPriceRow[]> {
    return this.db.serviceLevelPrice.findMany({
      where: { serviceId },
      select: { serviceId: true, priceLevelId: true, price: true },
    });
  }

  /** Prices of the given services for one level. */
  listLevelPricesOfLevel(
    levelId: string,
    serviceIds: readonly string[],
  ): Promise<ServiceLevelPriceRow[]> {
    if (serviceIds.length === 0) return Promise.resolve([]);
    return this.db.serviceLevelPrice.findMany({
      where: { priceLevelId: levelId, serviceId: { in: [...serviceIds] } },
      select: { serviceId: true, priceLevelId: true, price: true },
    });
  }

  /** Level prices of the location's services. The default level has none: its price is the base price. */
  listLevelPrices(locationId: string): Promise<ServiceLevelPriceRow[]> {
    return this.db.serviceLevelPrice.findMany({
      where: { priceLevel: { locationId, isDefault: false } },
      orderBy: [{ serviceId: 'asc' }, { priceLevelId: 'asc' }],
      select: { serviceId: true, priceLevelId: true, price: true },
    });
  }
}
