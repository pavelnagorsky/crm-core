import { Transform } from 'class-transformer';

/**
 * Accepts a numeric string or number, normalises to a 2dp signed string.
 * -12.5 → "-12.50", 12 → "12.00"
 */
export const NormalizeSignedAmount = () =>
  Transform(({ value }) => {
    if (value == null) return value;
    const n = Number(value);
    if (!isFinite(n)) return value;
    return (Math.round(n * 100) / 100).toFixed(2);
  });
