import { Prisma } from '@prisma/client';
import { PromotionProductStatsService } from './promotion-product-stats.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const NOW = new Date('2026-11-26T10:00:00Z');
const FROM = new Date('2026-10-27T10:00:00Z');
const LIVE_BOOKING_ORDERS = [{ bookingId: null }, { booking: { deletedAt: null } }];

describe('PromotionProductStatsService', () => {
  const db = {
    orderItem: { findMany: vi.fn() },
    bookingItem: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const staff = { listInLocation: vi.fn() };
  const service = new PromotionProductStatsService(db as never, staff as never);
  const visits = {
    revenue: d('0'),
    discount: d('0'),
    bookingsCount: 0,
    clientsCount: 0,
    newClients: 0,
    returningClients: 0,
    avgDiscount: d('0'),
    returnedRate: null,
    staff: [],
    notReturned: { count: 0, items: [] },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    db.orderItem.findMany.mockResolvedValue([]);
    db.bookingItem.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([]);
    staff.listInLocation.mockResolvedValue([]);
  });

  const orderWhere = () => db.orderItem.findMany.mock.calls[0][0].where.order;

  it('the promotion page leaves out the product lines of a deleted booking, as the usage counts do', async () => {
    await service.fullReport('loc', 'rule', FROM, NOW, visits as never);
    expect(orderWhere()).toEqual({
      locationId: 'loc',
      status: 'ACTIVE',
      OR: LIVE_BOOKING_ORDERS,
    });
  });

  it('the period totals leave out the product lines of a deleted booking', async () => {
    await service.periodTotals('loc', FROM, NOW);
    expect(orderWhere().OR).toEqual(LIVE_BOOKING_ORDERS);
  });

  it('the 30 day rule stats leave out the product lines of a deleted booking', async () => {
    await service.ruleStats('loc', ['rule'], NOW);
    expect(orderWhere().OR).toEqual(LIVE_BOOKING_ORDERS);
  });
});
