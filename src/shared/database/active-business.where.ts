import { Prisma } from '@prisma/client';

export const ACTIVE_BRAND_WHERE = {
  deletedAt: null,
} satisfies Prisma.BrandWhereInput;

export const ACTIVE_LOCATION_WHERE = {
  deletedAt: null,
  brand: ACTIVE_BRAND_WHERE,
} satisfies Prisma.LocationWhereInput;

export function automaticProcessingLocationWhere(
  occurredAt: Date,
): Prisma.LocationWhereInput {
  return {
    ...ACTIVE_LOCATION_WHERE,
    AND: [
      { OR: [{ restoredAt: null }, { restoredAt: { lt: occurredAt } }] },
      {
        OR: [
          { brand: { restoredAt: null } },
          { brand: { restoredAt: { lt: occurredAt } } },
        ],
      },
    ],
  };
}
