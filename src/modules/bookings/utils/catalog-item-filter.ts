import { Prisma } from '@prisma/client';

export const catalogItemIdDescription =
  'Catalog item id. A service matches bookings sold as that service. A bundle matches bookings of that bundle. A service does not match bookings of a bundle that contains it.';

export const catalogItemIdsDescription =
  'Catalog item ids. A service matches bookings sold as that service. A bundle matches bookings of that bundle. A service does not match bookings of a bundle that contains it. Repeat the key: ?catalogItemIds=UUID1&catalogItemIds=UUID2. A single value is accepted as a one-element array.';

export function catalogItemMatch(
  ids: string[],
  staffIds?: string[],
): Prisma.BookingWhereInput {
  const onItem = staffIds?.length ? { staffId: { in: staffIds } } : {};
  return {
    OR: [
      {
        bundleId: null,
        items: { some: { serviceId: { in: ids }, ...onItem } },
      },
      {
        bundleId: { in: ids },
        ...(staffIds?.length
          ? { items: { some: { staffId: { in: staffIds } } } }
          : {}),
      },
    ],
  };
}

export const catalogCategoryIdDescription =
  'Category id. Matches bookings sold as a service in that category, or as a bundle in that category. A bundle is not matched through the categories of the services inside it.';

export function catalogCategoryMatch(
  categoryId: string,
): Prisma.BookingWhereInput {
  return {
    OR: [
      { bundleId: null, items: { some: { service: { categoryId } } } },
      { bundle: { categoryId } },
    ],
  };
}

export function catalogCategorySql(categoryId: string): Prisma.Sql {
  return Prisma.sql`(
    ("bundleId" IS NULL AND "id" IN (
      SELECT bi."bookingId" FROM "BookingItem" bi
      JOIN "Service" s ON s."id" = bi."serviceId"
      WHERE s."categoryId" = ${categoryId}
    ))
    OR "bundleId" IN (SELECT "id" FROM "ServiceBundle" WHERE "categoryId" = ${categoryId})
  )`;
}

export function catalogItemSql(ids: string[]): Prisma.Sql {
  if (ids.length === 1) {
    const id = ids[0];
    return Prisma.sql`(("bundleId" IS NULL AND "id" IN (SELECT "bookingId" FROM "BookingItem" WHERE "serviceId" = ${id})) OR "bundleId" = ${id})`;
  }
  const inList = () => Prisma.join(ids.map((id) => Prisma.sql`${id}`));
  return Prisma.sql`(("bundleId" IS NULL AND "id" IN (SELECT "bookingId" FROM "BookingItem" WHERE "serviceId" IN (${inList()}))) OR "bundleId" IN (${inList()}))`;
}
