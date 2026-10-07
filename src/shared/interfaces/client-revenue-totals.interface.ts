import { Prisma } from '@prisma/client';

export interface ClientRevenueTotals {
  revenue: Prisma.Decimal;
  activeClients: number;
}
