import { ServiceFilter } from './interfaces/service-filter.interface.js';

export function catalogWhere(businessId: string, filter: ServiceFilter) {
  const search = filter.search?.trim();
  return {
    businessId,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(filter.categoryId !== undefined ? { categoryId: filter.categoryId } : {}),
    ...(filter.status !== undefined ? { status: filter.status } : {}),
  };
}
