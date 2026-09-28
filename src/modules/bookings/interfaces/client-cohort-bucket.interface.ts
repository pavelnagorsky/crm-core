import { Prisma } from '@prisma/client';

export interface ClientCohortBucket {
  bucket: Date;
  newVisits: number;
  returningVisits: number;
  activeClients: number;
  revenue: Prisma.Decimal;
}
