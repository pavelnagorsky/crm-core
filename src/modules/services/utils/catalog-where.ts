import { ServiceFilter } from '../interfaces/service-filter.interface.js';

export function catalogWhere(locationId: string, filter: ServiceFilter) {
  const search = filter.search?.trim();
  return {
    locationId,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(filter.categoryId !== undefined
      ? { categoryId: filter.categoryId }
      : {}),
    ...(filter.status !== undefined ? { status: filter.status } : {}),
  };
}
