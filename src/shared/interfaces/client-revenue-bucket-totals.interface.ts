import { Prisma } from '@prisma/client';

export interface ClientRevenueBucketTotals {
  bucket: Date;
  revenue: Prisma.Decimal;
  activeClients: number;
}
