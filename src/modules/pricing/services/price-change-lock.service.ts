import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Serializes the price change work of one location until the transaction ends. */
@Injectable()
export class PriceChangeLock {
  async lock(
    tx: Prisma.TransactionClient,
    locationId: string,
  ): Promise<void> {
    const key = `price-change:${locationId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
