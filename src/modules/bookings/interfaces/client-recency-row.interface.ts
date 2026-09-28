import { Prisma } from '@prisma/client';
import { ClientRecencyBucket } from '../enums/client-recency-bucket.enum.js';

export interface ClientRecencyRow {
  bucket: ClientRecencyBucket;
  clients: number;
  visits: number;
  revenue: Prisma.Decimal;
}
