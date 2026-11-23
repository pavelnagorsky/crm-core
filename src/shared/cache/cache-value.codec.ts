import { Prisma } from '@prisma/client';

const DATE_TAG = '__cache:date';
const DECIMAL_TAG = '__cache:decimal';
const BIGINT_TAG = '__cache:bigint';

function tagged(value: unknown): [string, string] | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const entries = Object.entries(value);
  if (entries.length !== 1) return undefined;
  const [tag, raw] = entries[0];
  return typeof raw === 'string' ? [tag, raw] : undefined;
}

/**
 * JSON for cached values that keeps `Date`, `Prisma.Decimal` and `bigint` as tagged objects,
 * for example `{ "__cache:date": "2026-01-01T00:00:00.000Z" }`. Every `decode` builds new objects.
 */
export const CacheValueCodec = {
  encode(value: unknown): string {
    return JSON.stringify(value, function (this: unknown, key, item) {
      // `toJSON` has already turned Date and Decimal into strings: read the original from the holder.
      const original = (this as Record<string, unknown>)[key];
      if (original instanceof Date)
        return { [DATE_TAG]: original.toISOString() };
      if (Prisma.Decimal.isDecimal(original))
        return { [DECIMAL_TAG]: original.toString() };
      if (typeof original === 'bigint')
        return { [BIGINT_TAG]: original.toString() };
      return item as unknown;
    });
  },

  decode<T>(payload: string): T {
    return JSON.parse(payload, (_key, item: unknown) => {
      const [tag, raw] = tagged(item) ?? [];
      if (tag === DATE_TAG) return new Date(raw!);
      if (tag === DECIMAL_TAG) return new Prisma.Decimal(raw!);
      if (tag === BIGINT_TAG) return BigInt(raw!);
      return item;
    }) as T;
  },
};
