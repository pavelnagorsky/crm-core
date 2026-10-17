import { Prisma } from '@prisma/client';

export interface LinePrice {
  listUnitPrice: Prisma.Decimal;
  listLineTotal: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}
