import { Prisma } from '@prisma/client';

export function fitsDecimal(
  value: Prisma.Decimal,
  precision: number,
  scale: number,
): boolean {
  return (
    value.isFinite() &&
    value.decimalPlaces() <= scale &&
    value.abs().lt(new Prisma.Decimal(10).pow(precision - scale))
  );
}
