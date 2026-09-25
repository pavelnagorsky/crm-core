import { Prisma } from '@prisma/client';

export interface ServiceCount {
  serviceId: string;
  serviceTitle: string;
  count: number;
  revenue: Prisma.Decimal;
  duration: number;
}
