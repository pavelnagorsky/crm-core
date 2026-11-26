import { Prisma } from '@prisma/client';

/** A return line ready to store, with its money as decimals. */
export type ResolvedReturnLine =
  Prisma.OrderReturnItemUncheckedCreateWithoutReturnInput & {
    quantity: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  };
