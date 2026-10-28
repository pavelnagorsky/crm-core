import { Prisma } from '@prisma/client';

export function cloneCacheValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value) as T;
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(value) as T;
  if (Array.isArray(value)) return value.map(cloneCacheValue) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneCacheValue(item)]),
    ) as T;
  }
  return value;
}
