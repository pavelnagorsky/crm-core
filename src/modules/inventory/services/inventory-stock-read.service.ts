import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { CountRow } from '../../../shared/database/interfaces/count-row.interface.js';
import { paginationSql } from '../../../shared/database/pagination-sql.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { InventoryCountsRequestDto } from '../dto/inventory-counts-request.dto.js';
import { InventorySearchRequestDto } from '../dto/inventory-search-request.dto.js';
import { InventorySearchOrderBy } from '../enums/inventory-search-order-by.enum.js';
import { InventoryBalanceView } from '../interfaces/inventory-balance-view.interface.js';
import { InventoryCountsView } from '../interfaces/inventory-counts-view.interface.js';
import { InventoryStockCountsRow } from '../interfaces/inventory-stock-counts-row.interface.js';

@Injectable()
export class InventoryStockReadService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    locationId: string,
    dto: InventorySearchRequestDto,
  ): Promise<PaginatedResult<InventoryBalanceView>> {
    const conditions = this.conditions(locationId, dto);
    if (dto.lowStock !== undefined)
      conditions.push(Prisma.sql`"lowStock" = ${dto.lowStock}`);
    if (dto.outOfStock !== undefined)
      conditions.push(Prisma.sql`"outOfStock" = ${dto.outOfStock}`);
    const where = Prisma.join(conditions, ' AND ');
    return this.db.$transaction(
      async (tx) => {
        const [count] = await tx.$queryRaw<
          CountRow[]
        >`SELECT COUNT(*) AS "totalItems" FROM "InventoryStockView" WHERE ${where}`;
        const items = await tx.$queryRaw<InventoryBalanceView[]>`
        SELECT "productLocationId", "productId", "name", "sku", "barcode", "unit",
          "quantityOnHand", "averageUnitCost", "stockValue", "reorderLevel", "lowStock", "outOfStock", "updatedAt"
        FROM "InventoryStockView" WHERE ${where}
        ORDER BY ${this.orderBy(dto)}, "productLocationId" COLLATE "C" ASC ${paginationSql(dto)}`;
        return { items, totalItems: Number(count.totalItems) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async counts(
    locationId: string,
    dto: InventoryCountsRequestDto,
  ): Promise<InventoryCountsView> {
    const [row] = await this.db.$queryRaw<InventoryStockCountsRow[]>`
      SELECT COUNT(*) FILTER (WHERE "lowStock") AS "lowStockCount",
        COUNT(*) FILTER (WHERE "outOfStock") AS "outOfStockCount"
      FROM "InventoryStockView" WHERE ${Prisma.join(this.conditions(locationId, dto), ' AND ')}`;
    return {
      lowStockCount: Number(row.lowStockCount),
      outOfStockCount: Number(row.outOfStockCount),
    };
  }

  private conditions(
    locationId: string,
    filter: InventoryCountsRequestDto,
  ): Prisma.Sql[] {
    const conditions = [Prisma.sql`"locationId" = ${locationId}`];
    if (filter.productIds?.length)
      conditions.push(
        Prisma.sql`"productId" IN (${Prisma.join(filter.productIds)})`,
      );
    const search = filter.search?.trim().toLocaleLowerCase('ru');
    if (search) {
      // strpos treats '%' and '_' literally, matching the former JS includes search.
      conditions.push(Prisma.sql`(strpos(lower("name" COLLATE "catalog_ru") COLLATE "C", ${search}) > 0
        OR strpos(lower(COALESCE("sku", '') COLLATE "catalog_ru") COLLATE "C", ${search}) > 0
        OR strpos(lower(COALESCE("barcode", '') COLLATE "catalog_ru") COLLATE "C", ${search}) > 0)`);
    }
    return conditions;
  }

  private orderBy(dto: InventorySearchRequestDto): Prisma.Sql {
    const fields: Record<InventorySearchOrderBy, Prisma.Sql> = {
      [InventorySearchOrderBy.NAME]: Prisma.sql`"name" COLLATE "catalog_ru"`,
      [InventorySearchOrderBy.QUANTITY_ON_HAND]: Prisma.sql`"quantityOnHand"`,
      [InventorySearchOrderBy.STOCK_VALUE]: Prisma.sql`"stockValue"`,
      [InventorySearchOrderBy.UPDATED_AT]: Prisma.sql`COALESCE("updatedAt", TIMESTAMP '1970-01-01')`,
    };
    const direction =
      (dto.orderDirection ?? OrderDirection.ASC) === OrderDirection.ASC
        ? Prisma.sql`ASC`
        : Prisma.sql`DESC`;
    return Prisma.sql`${fields[dto.orderBy ?? InventorySearchOrderBy.NAME]} ${direction}`;
  }
}
