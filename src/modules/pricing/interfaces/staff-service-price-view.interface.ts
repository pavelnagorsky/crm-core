import { Prisma } from '@prisma/client';

export interface StaffServicePriceView {
  serviceId: string;
  serviceTitle: string;
  basePrice: Prisma.Decimal;
  levelPrice: Prisma.Decimal;
  personalPrice: Prisma.Decimal | null;
  price: Prisma.Decimal;
}
