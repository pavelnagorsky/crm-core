/** Splits a fixed bundle price across its lines (docs/pricing-plan.md 2.1). */
export class BundleAllocationCalculator {
  private constructor() {}

  /**
   * Shares of `total` proportional to `weights` (integer minor units), by the largest
   * remainder method: every share is the floor of its exact part, and the leftover minor
   * units go one each to the largest remainders, earlier lines first on a tie. The shares
   * are never negative and always add up to `total`. Zero weights split evenly.
   * Products run in BigInt: total * weight can exceed Number.MAX_SAFE_INTEGER.
   */
  static allocate(total: number, weights: readonly number[]): number[] {
    if (weights.length === 0) throw new RangeError('Nothing to allocate to');
    if (!Number.isSafeInteger(total) || total < 0)
      throw new RangeError(`Invalid total ${total}`);
    if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0))
      throw new RangeError('Weights must be non-negative safe integers');

    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    const parts = (sum === 0 ? weights.map(() => 1) : weights).map(BigInt);
    const denominator = BigInt(sum === 0 ? weights.length : sum);
    const amount = BigInt(total);

    const shares = parts.map((part) => (amount * part) / denominator);
    const remainders = parts.map((part) => (amount * part) % denominator);
    let leftover = Number(
      amount - shares.reduce((acc, share) => acc + share, 0n),
    );
    const order = remainders
      .map((remainder, index) => ({ remainder, index }))
      .sort((a, b) =>
        a.remainder === b.remainder
          ? a.index - b.index
          : a.remainder > b.remainder
            ? -1
            : 1,
      );
    for (const { index } of order) {
      if (leftover === 0) break;
      shares[index] += 1n;
      leftover -= 1;
    }
    return shares.map(Number);
  }
}
