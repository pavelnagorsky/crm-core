import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';

/** Purchase prices from posted receipts, for "price below cost" warnings. */
@Injectable()
export class InventoryPurchaseCostService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Last purchase unit cost of each product line of the location: `unitCost` of the latest
   * POSTED RECEIPT item with a cost, by document `occurredAt`, then `postedAt`, then item
   * `position`. Products without such a receipt are absent from the map.
   */
  async lastPurchaseUnitCosts(
    locationId: string,
    productLocationIds: readonly string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Prisma.Decimal>> {
    const ids = [...new Set(productLocationIds)];
    if (ids.length === 0) return new Map();
    const client = tx ?? this.db;
    const rows = await client.$queryRaw<
      { productLocationId: string; unitCost: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (item."productLocationId")
        item."productLocationId" AS "productLocationId",
        item."unitCost" AS "unitCost"
      FROM "InventoryDocumentItem" item
      JOIN "InventoryDocument" document ON document."id" = item."documentId"
      WHERE document."locationId" = ${locationId}
        AND document."type" = 'RECEIPT'
        AND document."status" = 'POSTED'
        AND item."unitCost" IS NOT NULL
        AND item."productLocationId" IN (${Prisma.join(ids)})
      ORDER BY item."productLocationId",
        document."occurredAt" DESC,
        document."postedAt" DESC NULLS LAST,
        item."position" DESC
    `);
    return new Map(
      rows.map((row) => [
        row.productLocationId,
        new Prisma.Decimal(row.unitCost.toString()),
      ]),
    );
  }
}
