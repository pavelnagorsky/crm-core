import { Prisma } from '@prisma/client';

export interface ClientRevenue {
  clientId: string;
  revenue: Prisma.Decimal;
}
