import { Prisma } from '@prisma/client';
import regularExpressions from '../regular-expressions.js';

const SCALE = 2;

export class MoneyService {
  static decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
    return new Prisma.Decimal(value ?? 0);
  }

  /**
   * Canonical 2dp string when the input has at most 2 fractional digits.
   * A longer fractional part is returned unchanged so validation can reject it.
   */
  static canonical(value: unknown): unknown {
    if (value == null || value === '') return value;
    const raw = typeof value === 'number'
      ? (Number.isFinite(value) ? value.toString() : null)
      : typeof value === 'string'
        ? value.trim()
        : null;
    if (raw == null || !regularExpressions.decimalToken.test(raw)) return value;
    const amount = new Prisma.Decimal(raw);
    if (amount.decimalPlaces() > SCALE) return value;
    return amount.toFixed(SCALE);
  }

  /** Half-up to currency scale. Used once, when a calculation becomes a stored amount. */
  static quantize(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
    return MoneyService.decimal(value).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
  }

  /** Fixed-scale string for an amount that is already at currency scale. */
  static format(value: Prisma.Decimal | string | number | null | undefined): string {
    return MoneyService.decimal(value).toFixed(SCALE);
  }
}
