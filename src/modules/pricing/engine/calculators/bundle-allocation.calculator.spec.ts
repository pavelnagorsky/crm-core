import { BundleAllocationCalculator } from './bundle-allocation.calculator.js';

const sum = (values: readonly number[]) =>
  values.reduce((acc, value) => acc + value, 0);

/** Deterministic pseudo-random cases (LCG), so a failure always reproduces. */
function generatedCases(count: number): [number, number[]][] {
  let seed = 20261122;
  const next = (max: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };
  return Array.from({ length: count }, () => {
    const weights = Array.from({ length: 1 + next(7) }, () =>
      next(4) === 0 ? 0 : next(1_000_000),
    );
    return [next(10_000_000), weights];
  });
}

describe('BundleAllocationCalculator (plan 2.1)', () => {
  describe.each([
    ['120.00 over 60.00 / 90.00', 12000, [6000, 9000], [4800, 7200]],
    ['exact proportional split', 100, [1, 3], [25, 75]],
    ['leftover goes to the largest remainder', 10, [1, 2], [3, 7]],
    [
      'zero weights split evenly, leftover to the earliest',
      100,
      [0, 0, 0],
      [34, 33, 33],
    ],
    [
      'zero weight among others gets nothing',
      1000,
      [0, 500, 500],
      [0, 500, 500],
    ],
    ['3 minor over 6 equal weights', 3, [5, 5, 5, 5, 5, 5], [1, 1, 1, 0, 0, 0]],
    ['tie goes to the earlier index', 1, [7, 7], [1, 0]],
    ['three-way tie, leftovers to the earliest', 2, [1, 1, 1], [1, 1, 0]],
    ['zero total', 0, [6000, 9000], [0, 0]],
    ['single line takes everything', 12345, [1], [12345]],
    [
      'huge values without precision loss',
      100_000_000,
      [999_999_999, 1],
      [100_000_000, 0],
    ],
    [
      'huge values, small weight first',
      99_999_999,
      [1, 999_999_999],
      [0, 99_999_999],
    ],
  ])('%s', (_name, total, weights, expected) => {
    it(`allocates ${total} over [${weights.join(', ')}] as [${expected.join(', ')}]`, () => {
      expect(BundleAllocationCalculator.allocate(total, weights)).toEqual(
        expected,
      );
    });

    it('adds up to the total and never goes negative', () => {
      const shares = BundleAllocationCalculator.allocate(total, weights);
      expect(sum(shares)).toBe(total);
      expect(shares.every((share) => share >= 0)).toBe(true);
    });
  });

  it.each(generatedCases(200))(
    'sums to %i over %j with integer non-negative shares',
    (total, weights) => {
      const shares = BundleAllocationCalculator.allocate(total, weights);
      expect(shares).toHaveLength(weights.length);
      expect(sum(shares)).toBe(total);
      for (const share of shares) {
        expect(Number.isSafeInteger(share)).toBe(true);
        expect(share).toBeGreaterThanOrEqual(0);
      }
      // Largest remainder: every share is within one minor unit of its exact part.
      const weightSum = sum(weights);
      shares.forEach((share, index) => {
        const exact =
          weightSum === 0
            ? total / weights.length
            : (total * weights[index]) / weightSum;
        expect(Math.abs(share - exact)).toBeLessThan(1 + 1e-6);
      });
    },
  );

  it('keeps the products exact beyond Number.MAX_SAFE_INTEGER', () => {
    const total = Number.MAX_SAFE_INTEGER;
    const shares = BundleAllocationCalculator.allocate(total, [3, 7]);
    const exact = (BigInt(total) * 3n) / 10n;
    expect(BigInt(shares[0])).toBe(exact);
    expect(sum(shares)).toBe(total);
  });

  it('returns the same shares for the same input', () => {
    const weights = [3333, 3333, 3334];
    expect(BundleAllocationCalculator.allocate(10001, weights)).toEqual(
      BundleAllocationCalculator.allocate(10001, weights),
    );
  });

  it.each([
    ['no lines', 100, []],
    ['negative total', -1, [1]],
    ['fractional total', 1.5, [1]],
    ['NaN total', Number.NaN, [1]],
    ['unsafe total', Number.MAX_SAFE_INTEGER + 1, [1]],
    ['negative weight', 100, [1, -1]],
    ['fractional weight', 100, [1, 0.5]],
    ['infinite weight', 100, [Number.POSITIVE_INFINITY]],
  ])('throws RangeError for %s', (_name, total, weights) => {
    expect(() =>
      BundleAllocationCalculator.allocate(total, weights as number[]),
    ).toThrow(RangeError);
  });
});
