import { Prisma } from '@prisma/client';

export function activeBrandSql(brandId: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "Brand" active_brand
    WHERE active_brand."id" = ${brandId} AND active_brand."deletedAt" IS NULL
  )`;
}

export function activeLocationSql(locationId: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "Location" active_location
    JOIN "Brand" active_brand ON active_brand."id" = active_location."brandId"
    WHERE active_location."id" = ${locationId}
      AND active_location."deletedAt" IS NULL
      AND active_brand."deletedAt" IS NULL
  )`;
}
