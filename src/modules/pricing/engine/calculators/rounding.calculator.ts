import { RoundingMode } from '../enums/rounding-mode.enum.js';

/**
 * The only place the engine rounds money (docs/pricing-plan.md 2.1, 3.2). Amounts, steps
 * and basis points are integers in hundredths.
 */
export class RoundingCalculator {
  private constructor() {}

  /**
   * Snaps `amount` to a multiple of `step`: NEAREST rounds half up, DOWN floors. A step of
   * 1 (0.01) or less means no rounding. The result is never below 0.
   */
  static round(amount: number, step: number, mode: RoundingMode): number {
    if (!Number.isSafeInteger(amount))
      throw new RangeError(`Invalid amount ${amount}`);
    if (!Number.isSafeInteger(step) || step < 1)
      throw new RangeError(`Invalid rounding step ${step}`);
    if (amount <= 0) return 0;
    if (step === 1) return amount;
    const quotient = Math.floor(amount / step);
    const remainder = amount - quotient * step;
    const up = mode === RoundingMode.NEAREST && remainder * 2 >= step;
    return (quotient + (up ? 1 : 0)) * step;
  }

  /**
   * `basisPoints` / 10000 of a non-negative `amount`, half up to a minor unit:
   * 49.90 * 15% = 7.485 -> 7.49. Runs in BigInt when the product is not a safe integer.
   */
  static percent(amount: number, basisPoints: number): number {
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new RangeError(`Invalid amount ${amount}`);
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0)
      throw new RangeError(`Invalid percent ${basisPoints}`);
    const product = amount * basisPoints;
    if (Number.isSafeInteger(product)) return Math.floor((product + 5000) / 10000);
    return Number(
      (BigInt(amount) * BigInt(basisPoints) + 5000n) / 10000n,
    );
  }
}
