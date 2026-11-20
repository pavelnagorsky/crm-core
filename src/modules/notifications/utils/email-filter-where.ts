import { Prisma } from '@prisma/client';
import { EmailFilter } from '../interfaces/email-filter.interface.js';

/** Prisma filter of the admin list; `withStatus: false` drops the status filter (tab counts). */
export function emailFilterWhere(
  filter: EmailFilter,
  withStatus = true,
): Prisma.EmailMessageWhereInput {
  const search = filter.search?.trim();
  return {
    ...(withStatus && filter.status?.length
      ? { status: { in: filter.status } }
      : {}),
    ...(filter.template?.length ? { template: { in: filter.template } } : {}),
    ...(filter.audience ? { audience: filter.audience } : {}),
    ...(filter.brandId ? { brandId: filter.brandId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(filter.bookingId ? { bookingId: filter.bookingId } : {}),
    ...(filter.queuedFrom || filter.queuedTo
      ? {
          queuedAt: {
            ...(filter.queuedFrom ? { gte: new Date(filter.queuedFrom) } : {}),
            ...(filter.queuedTo ? { lt: new Date(filter.queuedTo) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { recipient: { contains: search, mode: 'insensitive' } },
            { subject: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}
