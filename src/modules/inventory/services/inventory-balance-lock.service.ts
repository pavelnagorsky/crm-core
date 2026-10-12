import { Injectable } from '@nestjs/common';
import { InventoryBalance, Prisma } from '@prisma/client';

@Injectable()
export class InventoryBalanceLockService {
  async lock(
    tx: Prisma.TransactionClient,
    productLocationIds: string[],
  ): Promise<Map<string, InventoryBalance>> {
    const ids = [...new Set(productLocationIds)].sort();
    for (const productLocationId of ids) {
      await tx.inventoryBalance.upsert({
        where: { productLocationId },
        create: { productLocationId },
        update: {},
      });
    }
    const rows = await tx.$queryRaw<InventoryBalance[]>(Prisma.sql`
      SELECT * FROM "InventoryBalance"
      WHERE "productLocationId" IN (${Prisma.join(ids)})
      ORDER BY "productLocationId"
      FOR UPDATE
    `);
    return new Map(rows.map((row) => [row.productLocationId, row]));
  }
}
