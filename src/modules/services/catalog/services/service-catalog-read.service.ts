import { Injectable } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { CountRow } from '../../../../shared/database/interfaces/count-row.interface.js';
import { paginationSql } from '../../../../shared/database/pagination-sql.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { ServiceCatalogKind } from '../../enums/service-catalog-kind.enum.js';
import { ServiceSearchOrderBy } from '../../enums/service-search-order-by.enum.js';
import { ServiceCatalogCountsRequestDto } from '../dto/service-catalog-counts-request.dto.js';
import { ServiceCatalogSearchRequestDto } from '../dto/service-catalog-search-request.dto.js';
import { ServiceCatalogItemFactory } from '../factories/service-catalog-item.factory.js';
import { ServiceCatalogCountsRow } from '../interfaces/service-catalog-counts-row.interface.js';
import { ServiceCatalogCounts } from '../interfaces/service-catalog-counts.interface.js';
import { ServiceCatalogItem } from '../interfaces/service-catalog-item.js';
import { ServiceCatalogKey } from '../interfaces/service-catalog-key.interface.js';
import { ServiceBundleReadService } from './service-bundle-read.service.js';
import { ServiceReadService } from './service-read.service.js';

@Injectable()
export class ServiceCatalogReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly services: ServiceReadService,
    private readonly bundles: ServiceBundleReadService,
    private readonly items: ServiceCatalogItemFactory,
  ) {}

  search(
    locationId: string,
    dto: ServiceCatalogSearchRequestDto,
  ): Promise<PaginatedResult<ServiceCatalogItem>> {
    const where = this.where(locationId, dto);
    // Page keys, total and their details must all describe the same catalog snapshot.
    return this.db.$transaction(
      async (tx) => {
        const [count] = await tx.$queryRaw<
          CountRow[]
        >`SELECT COUNT(*) AS "totalItems" FROM "ServiceCatalogView" WHERE ${where}`;
        const keys = await tx.$queryRaw<ServiceCatalogKey[]>`
        SELECT "id", "kind" FROM "ServiceCatalogView" WHERE ${where}
        ORDER BY ${this.orderBy(dto)}, CASE "kind" WHEN 'SERVICE' THEN 0 ELSE 1 END ${paginationSql(dto)}`;
        const items = await this.resolvePage(locationId, keys, tx);
        return { items, totalItems: Number(count.totalItems) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async resolvePage(
    locationId: string,
    keys: ServiceCatalogKey[],
    tx: Prisma.TransactionClient,
  ): Promise<ServiceCatalogItem[]> {
    const services = await this.services.resolveCatalogEntries(
      locationId,
      keys
        .filter((k) => k.kind === ServiceCatalogKind.SERVICE)
        .map((k) => k.id),
      tx,
    );
    const bundles = await this.bundles.resolveCatalogEntries(
      locationId,
      keys.filter((k) => k.kind === ServiceCatalogKind.BUNDLE).map((k) => k.id),
      tx,
    );
    const byService = new Map(
      services.map((row) => [row.id, this.items.fromService(row)]),
    );
    const byBundle = new Map(
      bundles.map((row) => [row.id, this.items.fromBundle(row)]),
    );
    return keys.map((key) => {
      const item = (
        key.kind === ServiceCatalogKind.SERVICE ? byService : byBundle
      ).get(key.id);
      if (!item)
        throw new Error(
          `Catalog entry missing from snapshot: ${key.kind}/${key.id}`,
        );
      return item;
    });
  }

  async counts(
    locationId: string,
    dto: ServiceCatalogCountsRequestDto,
  ): Promise<ServiceCatalogCounts> {
    const where = this.where(locationId, {
      search: dto.search,
      categoryId: dto.categoryId,
    });
    const status =
      dto.status === undefined
        ? Prisma.sql`true`
        : Prisma.sql`"status" = ${dto.status}`;
    const kind =
      dto.kind === undefined
        ? Prisma.sql`true`
        : Prisma.sql`"kind" = ${dto.kind}`;
    // Each facet ignores its own filter, while respecting the other facet.
    const [row] = await this.db.$queryRaw<ServiceCatalogCountsRow[]>`
      SELECT COUNT(*) FILTER (WHERE ${status} AND ${kind}) AS "totalCount",
        COUNT(*) FILTER (WHERE "status" = 'ACTIVE' AND ${kind}) AS "activeCount",
        COUNT(*) FILTER (WHERE "status" = 'INACTIVE' AND ${kind}) AS "inactiveCount",
        COUNT(*) FILTER (WHERE "kind" = 'SERVICE' AND ${status}) AS "serviceCount",
        COUNT(*) FILTER (WHERE "kind" = 'BUNDLE' AND ${status}) AS "bundleCount"
      FROM "ServiceCatalogView" WHERE ${where}`;
    return {
      total: Number(row.totalCount),
      byStatus: [
        { status: ServiceStatus.ACTIVE, count: Number(row.activeCount) },
        { status: ServiceStatus.INACTIVE, count: Number(row.inactiveCount) },
      ],
      byKind: [
        { kind: ServiceCatalogKind.SERVICE, count: Number(row.serviceCount) },
        { kind: ServiceCatalogKind.BUNDLE, count: Number(row.bundleCount) },
      ],
    };
  }

  private where(
    locationId: string,
    dto: Pick<
      ServiceCatalogSearchRequestDto,
      'search' | 'categoryId' | 'status' | 'kind'
    >,
  ): Prisma.Sql {
    const parts = [Prisma.sql`"locationId" = ${locationId}`];
    if (dto.kind !== undefined) parts.push(Prisma.sql`"kind" = ${dto.kind}`);
    if (dto.status !== undefined)
      parts.push(Prisma.sql`"status" = ${dto.status}`);
    if (dto.categoryId !== undefined)
      parts.push(
        dto.categoryId === null
          ? Prisma.sql`"categoryId" IS NULL`
          : Prisma.sql`"categoryId" = ${dto.categoryId}`,
      );
    const search = dto.search?.trim().toLocaleLowerCase('ru');
    if (search)
      parts.push(Prisma.sql`(strpos(lower("title" COLLATE "catalog_ru") COLLATE "C", ${search}) > 0
      OR strpos(lower(COALESCE("description", '') COLLATE "catalog_ru") COLLATE "C", ${search}) > 0)`);
    return Prisma.join(parts, ' AND ');
  }

  private orderBy(dto: ServiceCatalogSearchRequestDto): Prisma.Sql {
    const fields: Record<ServiceSearchOrderBy, Prisma.Sql> = {
      [ServiceSearchOrderBy.TITLE]: Prisma.sql`"title" COLLATE "catalog_ru"`,
      [ServiceSearchOrderBy.CATEGORY]: Prisma.sql`"categoryName" COLLATE "catalog_ru"`,
      [ServiceSearchOrderBy.DURATION_MINUTES]: Prisma.sql`"durationMinutes"`,
      [ServiceSearchOrderBy.PRICE]: Prisma.sql`"price"`,
      [ServiceSearchOrderBy.SORT_ORDER]: Prisma.sql`"sortOrder"`,
      [ServiceSearchOrderBy.STATUS]: Prisma.sql`"status" COLLATE "catalog_ru"`,
      [ServiceSearchOrderBy.CREATED_AT]: Prisma.sql`"createdAt"`,
    };
    const direction =
      (dto.orderDirection ?? OrderDirection.DESC) === OrderDirection.DESC
        ? Prisma.sql`DESC`
        : Prisma.sql`ASC`;
    return Prisma.sql`${fields[dto.orderBy ?? ServiceSearchOrderBy.SORT_ORDER]} ${direction} NULLS LAST, "id" COLLATE "C" ${direction}`;
  }
}
