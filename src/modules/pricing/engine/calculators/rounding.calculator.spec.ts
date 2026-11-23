import { RoundingMode } from '../enums/rounding-mode.enum.js';
import { RoundingCalculator } from './rounding.calculator.js';

describe('RoundingCalculator (plan 2.1)', () => {
  describe('round', () => {
    it.each([
      ['57.39 to 1.00 nearest', 5739, 100, 'NEAREST', 5700],
      ['57.50 to 1.00 nearest: half up', 5750, 100, 'NEAREST', 5800],
      ['57.49 to 1.00 nearest', 5749, 100, 'NEAREST', 5700],
      ['57.39 to 0.10 nearest', 5739, 10, 'NEAREST', 5740],
      ['57.39 to 0.50 nearest', 5739, 50, 'NEAREST', 5750],
      ['57.24 to 0.50 nearest', 5724, 50, 'NEAREST', 5700],
      ['57.39 to 5.00 nearest', 5739, 500, 'NEAREST', 5500],
      ['57.50 to 5.00 nearest: half up', 5750, 500, 'NEAREST', 6000],
      ['57.39 to 10.00 nearest', 5739, 1000, 'NEAREST', 6000],
      ['exact multiple stays', 5700, 100, 'NEAREST', 5700],
      ['step 0.01: no rounding', 5739, 1, 'NEAREST', 5739],
      ['36.55 to 1.00 down', 3655, 100, 'DOWN', 3600],
      ['36.99 to 1.00 down', 3699, 100, 'DOWN', 3600],
      ['36.99 to 5.00 down', 3699, 500, 'DOWN', 3500],
      ['step 0.01 down: no rounding', 3699, 1, 'DOWN', 3699],
      ['below half a step rounds to 0', 40, 100, 'NEAREST', 0],
      ['never below 0', -500, 100, 'NEAREST', 0],
      ['0 stays 0', 0, 100, 'DOWN', 0],
    ] as const)('%s', (_name, amount, step, mode, expected) => {
      expect(RoundingCalculator.round(amount, step, RoundingMode[mode])).toBe(
        expected,
      );
    });

    it.each([
      ['fractional amount', 10.5, 100],
      ['zero step', 100, 0],
      ['fractional step', 100, 0.5],
    ])('rejects %s', (_name, amount, step) => {
      expect(() =>
        RoundingCalculator.round(amount, step, RoundingMode.NEAREST),
      ).toThrow(RangeError);
    });
  });

  describe('percent: half up to a minor unit', () => {
    it.each([
      ['49.90 * 15% = 7.485 -> 7.49', 4990, 1500, 749],
      ['49.90 * 10% = 4.99', 4990, 1000, 499],
      ['0.05 * 10% = 0.005 -> 0.01', 5, 1000, 1],
      ['0.04 * 10% = 0.004 -> 0', 4, 1000, 0],
      ['60.00 * 12.5% = 7.50', 6000, 1250, 750],
      ['0 * 20% = 0', 0, 2000, 0],
      ['huge amount runs in BigInt', 9_000_000_000_000, 100_000, 90_000_000_000_000],
    ])('%s', (_name, amount, basisPoints, expected) => {
      expect(RoundingCalculator.percent(amount, basisPoints)).toBe(expected);
    });
  });
});
