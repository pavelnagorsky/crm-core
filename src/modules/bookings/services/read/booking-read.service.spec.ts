import { BookingSearchRequestDto } from '../../dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from '../../enums/booking-search-order-by.enum.js';
import { BookingReadService } from './booking-read.service.js';

describe('Participant-scoped booking queries', () => {
  const db = {
    booking: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const service = new BookingReadService(db as never);
  const ownFilter = { items: { some: { staffId: 'anna' } } };

  beforeEach(() => {
    vi.clearAllMocks();
    db.booking.findMany.mockResolvedValue([]);
    db.booking.count.mockResolvedValue(0);
    db.booking.groupBy.mockResolvedValue([]);
  });

  it.each([
    { page: 2, pageSize: 10 },
    { page: 1, pageSize: 10, isExport: true },
    { page: 1, pageSize: 10, orderBy: BookingSearchOrderBy.PRICE },
  ])('scopes rows and totals before pagination for %j', async (dto) => {
    await service.search('location-1', dto as BookingSearchRequestDto, 'anna');
    const where = db.booking.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      locationId: 'location-1',
      deletedAt: null,
      items: ownFilter.items,
    });
    expect(db.booking.count).toHaveBeenCalledWith({ where });
  });

  it('intersects caller filters with mandatory participation', async () => {
    await service.search(
      'location-1',
      {
        page: 1,
        pageSize: 10,
        staffIds: ['boris'],
        clientId: 'client',
        search: 'Alice',
      } as BookingSearchRequestDto,
      'anna',
    );
    const where = db.booking.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { items: { some: { staffId: { in: ['boris'] } } } },
    ]);
    expect(where.items).toEqual(ownFilter.items);
    expect(where.clientId).toBe('client');
    expect(where.OR.length).toBeGreaterThan(0);
  });

  it('applies the same mandatory participation to status counts', async () => {
    await service.getStatusCounts('location-1', 'anna');
    expect(db.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ items: ownFilter.items }),
      }),
    );
  });

  it('leaves unrestricted queries unfiltered', async () => {
    await service.search('location-1', {
      page: 1,
      pageSize: 10,
    } as BookingSearchRequestDto);
    expect(db.booking.findMany.mock.calls[0][0].where.AND).toBeUndefined();
    expect(db.booking.findMany.mock.calls[0][0].where.items).toBeUndefined();
  });
});
