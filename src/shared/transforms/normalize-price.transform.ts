import { Transform } from 'class-transformer';

/**
 * Accepts any positive numeric string or number, normalises to a 2dp string.
 * 49 → "49.00", 49.1 → "49.10", 49.3223 → "49.32"
 */
export const NormalizePrice = () =>
  Transform(({ value }) => {
    if (value == null) return value;
    const n = Number(value);
    if (!isFinite(n)) return value;
    return (Math.round(n * 100) / 100).toFixed(2);
  });
