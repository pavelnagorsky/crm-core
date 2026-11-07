import { createTestCache } from '../../../shared/cache/testing/create-test-cache.js';
import { BookingPagesService } from './booking-pages.service.js';

describe('BookingPagesService.listPublished', () => {
  const cache = createTestCache();
  const rows = [
    { slug: 'a', updatedAt: new Date('2026-11-01T00:00:00Z') },
    { slug: 'b', updatedAt: new Date('2026-11-02T00:00:00Z') },
    { slug: 'c', updatedAt: new Date('2026-11-03T00:00:00Z') },
  ];
  const findMany = vi.fn();
  const service = new BookingPagesService(
    { bookingPage: { findMany } } as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    cache,
  );

  beforeEach(async () => {
    findMany.mockReset();
    findMany.mockResolvedValue(rows);
    await cache.invalidate('booking-pages.public:all');
  });
  afterAll(() => cache.onModuleDestroy());

  it('selects only published pages of active, public locations', async () => {
    await service.listPublished(1, 10);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'PUBLISHED',
        location: {
          deletedAt: null,
          brand: { deletedAt: null },
          bookingVisibility: 'PUBLIC',
        },
      },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    });
  });

  it('paginates the cached list and loads it once', async () => {
    const first = await service.listPublished(1, 2);
    const second = await service.listPublished(2, 2);
    expect(first.items.map((i) => i.slug)).toEqual(['a', 'b']);
    expect(second.items.map((i) => i.slug)).toEqual(['c']);
    expect(second.totalItems).toBe(3);
    expect((await service.listPublished(9, 2)).items).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('reloads after a page mutation invalidates the list', async () => {
    await service.listPublished(1, 10);
    await cache.invalidate('booking-pages.public:all');
    await service.listPublished(1, 10);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
