import { Prisma } from '@prisma/client';

export class UnitCostUtils {
  static quantize(value: Prisma.Decimal): Prisma.Decimal {
    return value.toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
  }

  static format(value: Prisma.Decimal): string {
    return value.toFixed(8);
  }
}
