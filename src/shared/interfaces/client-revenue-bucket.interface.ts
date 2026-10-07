import { Prisma } from '@prisma/client';

export interface ClientRevenueBucket {
  bucket: Date;
  clientId: string;
  revenue: Prisma.Decimal;
}
