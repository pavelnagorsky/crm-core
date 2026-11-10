import { DatabaseService } from '../../../database/database.service.js';
import { createTestCache } from '../../../shared/cache/testing/create-test-cache.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';

function setup() {
  const db = {
    review: {
      groupBy: vi.fn().mockResolvedValue([
        { rating: 5, _count: { _all: 2 } },
        { rating: 4, _count: { _all: 1 } },
      ]),
      findMany: vi.fn().mockResolvedValue([{ id: 'r1', staff: [] }]),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      { staffId: 'a', rating: 5, count: 3 },
      { staffId: 'b', rating: 4, count: 1 },
    ]),
  };
  const service = new ReviewAggregatesService(
    db as unknown as DatabaseService,
    createTestCache(),
  );
  return { db, service };
}

describe('ReviewAggregatesService', () => {
  it('builds the location overview from published reviews only', async () => {
    const { db, service } = setup();
    const overview = await service.getLocationOverview('loc');
    expect(overview.summary).toMatchObject({ count: 3, average: 4.7 });
    expect(overview.latest).toHaveLength(1);
    expect(db.review.groupBy.mock.calls[0][0].where).toEqual({
      locationId: 'loc',
      status: 'PUBLISHED',
    });
    expect(db.review.findMany.mock.calls[0][0]).toMatchObject({
      where: { locationId: 'loc', status: 'PUBLISHED' },
      take: 3,
    });
  });

  it('serves repeated reads from cache until the location is invalidated', async () => {
    const { db, service } = setup();
    await service.getLocationOverview('loc');
    await service.getLocationSummary('loc');
    expect(db.review.groupBy).toHaveBeenCalledTimes(1);
    await service.invalidateLocation('loc');
    await service.getLocationOverview('loc');
    expect(db.review.groupBy).toHaveBeenCalledTimes(2);
  });

  it('returns summaries only for requested staff that have reviews', async () => {
    const { db, service } = setup();
    const summaries = await service.getStaffSummaries('loc', ['a', 'c']);
    expect([...summaries]).toEqual([['a', { count: 3, average: 5 }]]);
    await service.getStaffSummaries('loc', ['b']);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('skips the query without staff ids', async () => {
    const { db, service } = setup();
    expect((await service.getStaffSummaries('loc', [])).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
