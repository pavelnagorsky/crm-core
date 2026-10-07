import { Prisma } from '@prisma/client';
import regularExpressions from '../regular-expressions.js';

const SCALE = 3;

export class QuantityService {
  static decimal(
    value: Prisma.Decimal | string | number | null | undefined,
  ): Prisma.Decimal {
    return new Prisma.Decimal(value ?? 0);
  }

  static canonical(value: unknown): unknown {
    if (value == null || value === '') return value;
    const raw =
      typeof value === 'number'
        ? Number.isFinite(value)
          ? value.toString()
          : null
        : typeof value === 'string'
          ? value.trim()
          : null;
    if (raw == null || !regularExpressions.decimalToken.test(raw)) return value;
    const quantity = new Prisma.Decimal(raw);
    if (quantity.decimalPlaces() > SCALE) return value;
    return quantity.toFixed(SCALE);
  }

  static format(
    value: Prisma.Decimal | string | number | null | undefined,
  ): string {
    return QuantityService.decimal(value).toFixed(SCALE);
  }
}
