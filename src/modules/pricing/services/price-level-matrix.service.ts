import { Injectable } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PersonalPrice } from '../interfaces/personal-price.interface.js';
import { PriceLevelMatrix } from '../interfaces/price-level-matrix.interface.js';
import { PriceLevelMatrixCategory } from '../interfaces/price-level-matrix-category.interface.js';
import { PriceLevelMatrixRow } from '../interfaces/price-level-matrix-row.interface.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { PriceLevelsService } from './price-levels.service.js';

const UNCATEGORIZED_NAME = 'Без категории';

/** Cabinet tables of the level prices: services by levels, and the personal prices of staff. */
@Injectable()
export class PriceLevelMatrixService {
  constructor(
    private readonly levels: PriceLevelsService,
    private readonly levelReads: PriceLevelReadService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly staff: StaffService,
  ) {}

  /**
   * Every active service by category with its price on each non-default level. A level
   * without an own price for a service has null there: the base price applies.
   */
  async matrix(locationId: string): Promise<PriceLevelMatrix> {
    const [levels, levelPrices, catalog] = await Promise.all([
      this.levels.list(locationId),
      this.levelReads.listLevelPrices(locationId),
      this.serviceCatalog.loadCatalogSnapshot(
        locationId,
        ReadConsistency.CACHED,
      ),
    ]);
    const priceOf = new Map(
      levelPrices.map((row) => [`${row.serviceId}:${row.priceLevelId}`, row.price]),
    );
    const matrixLevels = levels.filter((level) => !level.isDefault);
    const toRow = (
      service: (typeof catalog.services)[number],
    ): PriceLevelMatrixRow => ({
      serviceId: service.id,
      title: service.title,
      basePrice: service.price,
      prices: matrixLevels.map((level) => ({
        levelId: level.id,
        price: priceOf.get(`${service.id}:${level.id}`) ?? null,
      })),
    });
    const active = catalog.services
      .filter((service) => service.status === ServiceStatus.ACTIVE)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

    const categories: PriceLevelMatrixCategory[] = catalog.categories.map(
      (category) => ({
        id: category.id,
        name: category.name,
        services: active
          .filter((service) => service.categoryId === category.id)
          .map(toRow),
      }),
    );
    const known = new Set(catalog.categories.map((category) => category.id));
    categories.push({
      id: null,
      name: UNCATEGORIZED_NAME,
      services: active
        .filter(
          (service) =>
            service.categoryId === null || !known.has(service.categoryId),
        )
        .map(toRow),
    });
    return {
      levels,
      categories: categories.filter((category) => category.services.length > 0),
    };
  }

  /**
   * Personal prices of active staff with the price their level would give: the level price,
   * else the base price. By staff name, then service title.
   */
  async personalPrices(locationId: string): Promise<PersonalPrice[]> {
    const [rows, levels, levelPrices, catalog] = await Promise.all([
      this.staff.listPersonalPriceRows(locationId),
      this.levelReads.listLevels(locationId),
      this.levelReads.listLevelPrices(locationId),
      this.serviceCatalog.loadCatalogSnapshot(
        locationId,
        ReadConsistency.CACHED,
      ),
    ]);
    const services = new Map(
      catalog.services.map((service) => [service.id, service]),
    );
    const levelById = new Map(levels.map((level) => [level.id, level]));
    const defaultLevel = levels.find((level) => level.isDefault);
    const levelPriceOf = new Map<string, Prisma.Decimal>(
      levelPrices.map((row) => [`${row.serviceId}:${row.priceLevelId}`, row.price]),
    );
    const prices = rows.flatMap(({ staff, serviceId, price }) => {
      const service = services.get(serviceId);
      if (!service) return [];
      const level =
        (staff.priceLevelId ? levelById.get(staff.priceLevelId) : undefined) ??
        defaultLevel;
      const levelPrice =
        (staff.priceLevelId
          ? levelPriceOf.get(`${serviceId}:${staff.priceLevelId}`)
          : undefined) ?? service.price;
      return [
        {
          staffId: staff.id,
          staffName: staff.name,
          avatarUrl: staff.avatarFile?.url ?? null,
          levelName: level?.name ?? null,
          serviceId,
          serviceTitle: service.title,
          levelPrice,
          price,
        },
      ];
    });
    return prices.sort(
      (a, b) =>
        a.staffName.localeCompare(b.staffName) ||
        a.serviceTitle.localeCompare(b.serviceTitle),
    );
  }
}
