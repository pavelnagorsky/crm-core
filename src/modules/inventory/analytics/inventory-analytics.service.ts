import { Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { InventoryKpiQueryDto } from './dto/inventory-kpi-query.dto.js';
import { InventoryKpiSummaryRow } from './interfaces/inventory-kpi-summary-row.interface.js';
import { InventoryKpiView } from './interfaces/inventory-kpi-view.interface.js';
import { InventoryReplenishmentItemView } from './interfaces/inventory-replenishment-item-view.interface.js';

@Injectable()
export class InventoryAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getKpi(
    locationId: string,
    dto: InventoryKpiQueryDto,
  ): Promise<InventoryKpiView> {
    const topLimit = dto.topLimit ?? 5;
    const deadStockSince = this.daysAgo(dto.deadStockDays ?? 90);
    const movementSince = this.daysAgo(dto.movementDays ?? 30);
    const [summaryRows, topReplenishmentItems] = await this.db.$transaction([
      this.db.$queryRaw<InventoryKpiSummaryRow[]>(
        this.inventoryKpiSummaryQuery(
          locationId,
          deadStockSince,
          movementSince,
        ),
      ),
      this.db.$queryRaw<InventoryReplenishmentItemView[]>(
        this.topReplenishmentQuery(locationId, topLimit),
      ),
    ]);
    const summary = summaryRows[0] ?? {
      totalProducts: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      stockValue: new Prisma.Decimal(0),
      deadStockCount: 0,
      movingProductsCount: 0,
    };
    return {
      totalProducts: summary.totalProducts,
      lowStockCount: summary.lowStockCount,
      outOfStockCount: summary.outOfStockCount,
      stockValue: MoneyService.quantize(summary.stockValue),
      deadStockCount: summary.deadStockCount,
      movingProductsCount: summary.movingProductsCount,
      topReplenishmentItems,
    };
  }

  private inventoryKpiSummaryQuery(
    locationId: string,
    deadStockSince: Date,
    movementSince: Date,
  ): Prisma.Sql {
    return Prisma.sql`
      WITH inventory AS (
        SELECT
          pl.id AS "productLocationId",
          COALESCE(ib."quantityOnHand", 0::numeric) AS "quantityOnHand",
          COALESCE(ib."averageUnitCost", 0::numeric) AS "averageUnitCost",
          pl."reorderLevel" AS "reorderLevel"
        FROM "ProductLocation" pl
        LEFT JOIN "InventoryBalance" ib ON ib."productLocationId" = pl.id
        WHERE pl."locationId" = ${locationId}
          AND pl."trackInventory" = true
      ),
      recent_sales AS (
        SELECT DISTINCT im."productLocationId"
        FROM "InventoryMovement" im
        INNER JOIN inventory i ON i."productLocationId" = im."productLocationId"
        WHERE im."locationId" = ${locationId}
          AND im."type" = CAST(${InventoryMovementType.SALE} AS "InventoryMovementType")
          AND im."occurredAt" >= ${deadStockSince}
      ),
      recent_movements AS (
        SELECT DISTINCT im."productLocationId"
        FROM "InventoryMovement" im
        INNER JOIN inventory i ON i."productLocationId" = im."productLocationId"
        WHERE im."locationId" = ${locationId}
          AND im."occurredAt" >= ${movementSince}
      )
      SELECT
        COUNT(*)::int AS "totalProducts",
        COUNT(*) FILTER (
          WHERE i."quantityOnHand" <= i."reorderLevel"
        )::int AS "lowStockCount",
        COUNT(*) FILTER (WHERE i."quantityOnHand" <= 0::numeric)::int
          AS "outOfStockCount",
        COALESCE(
          SUM(ROUND(i."quantityOnHand" * i."averageUnitCost", 2)),
          0::numeric
        ) AS "stockValue",
        COUNT(*) FILTER (
          WHERE i."quantityOnHand" > 0::numeric
            AND rs."productLocationId" IS NULL
        )::int AS "deadStockCount",
        (SELECT COUNT(*)::int FROM recent_movements) AS "movingProductsCount"
      FROM inventory i
      LEFT JOIN recent_sales rs ON rs."productLocationId" = i."productLocationId"
    `;
  }

  private topReplenishmentQuery(
    locationId: string,
    topLimit: number,
  ): Prisma.Sql {
    return Prisma.sql`
      WITH inventory AS (
        SELECT
          pl.id AS "productLocationId",
          pl."productId" AS "productId",
          p.name AS "name",
          p.sku AS "sku",
          p.barcode AS "barcode",
          p.unit AS "unit",
          COALESCE(ib."quantityOnHand", 0::numeric) AS "quantityOnHand",
          pl."reorderLevel" AS "reorderLevel",
          GREATEST(
            pl."reorderLevel" - COALESCE(ib."quantityOnHand", 0::numeric),
            0::numeric
          ) AS "missingQuantity",
          ROUND(
            COALESCE(ib."quantityOnHand", 0::numeric) *
              COALESCE(ib."averageUnitCost", 0::numeric),
            2
          ) AS "stockValue",
          ib."updatedAt" AS "updatedAt"
        FROM "ProductLocation" pl
        INNER JOIN "Product" p ON p.id = pl."productId"
        LEFT JOIN "InventoryBalance" ib ON ib."productLocationId" = pl.id
        WHERE pl."locationId" = ${locationId}
          AND pl."trackInventory" = true
      )
      SELECT
        "productLocationId",
        "productId",
        "name",
        "sku",
        "barcode",
        "unit",
        "quantityOnHand",
        "reorderLevel",
        "missingQuantity",
        "stockValue",
        "updatedAt"
      FROM inventory
      WHERE "quantityOnHand" <= "reorderLevel"
      ORDER BY
        CASE WHEN "quantityOnHand" <= 0::numeric THEN 0 ELSE 1 END ASC,
        "missingQuantity" DESC,
        "updatedAt" DESC NULLS LAST,
        "name" ASC,
        "productLocationId" ASC
      LIMIT ${topLimit}
    `;
  }

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
