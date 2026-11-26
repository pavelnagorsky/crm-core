import { Prisma } from '@prisma/client';
import { PriceChangeReason } from '../../pricing/enums/price-change-reason.enum.js';
import { OrderPriceAnalyticsService } from './order-price-analytics.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const FROM = new Date('2026-11-01T00:00:00Z');
const TO = new Date('2026-12-01T00:00:00Z');
const query = {
  from: FROM,
  to: TO,
  now: new Date('2026-11-26T10:00:00Z'),
  changedOnly: true,
};

describe('OrderPriceAnalyticsService', () => {
  const db = { orderItem: { findMany: vi.fn(), count: vi.fn() } };
  const service = new OrderPriceAnalyticsService(db as never);

  beforeEach(() => {
    vi.resetAllMocks();
    db.orderItem.findMany.mockResolvedValue([]);
  });

  it('reads confirmed product lines of active orders, without the lines of a deleted booking', async () => {
    await service.items('loc', query);
    expect(db.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'PRODUCT',
          status: 'CONFIRMED',
          confirmedAt: { gte: FROM, lt: TO },
          order: {
            locationId: 'loc',
            status: 'ACTIVE',
            OR: [{ bookingId: null }, { booking: { deletedAt: null } }],
          },
        }),
      }),
    );
  });

  it('maps a line of a sale with its discount layer', async () => {
    db.orderItem.findMany.mockResolvedValue([
      {
        id: 'oi1',
        orderId: 'o1',
        title: 'Шампунь',
        quantity: d('2.000'),
        listUnitPrice: d('10.00'),
        customUnitPrice: null,
        lineTotal: d('18.00'),
        sellerStaffId: null,
        sellerName: null,
        confirmedAt: new Date('2026-11-10T10:00:00Z'),
        priceAdjustments: [
          {
            sortOrder: 0,
            kind: 'PROMOTION',
            ruleId: 'r1',
            title: 'Осень',
            valueType: 'PERCENT',
            value: d('10'),
            amount: d('-2.00'),
          },
        ],
        returnItems: [],
        order: {
          bookingId: null,
          clientId: null,
          clientName: null,
          booking: null,
        },
      },
    ]);
    const items = await service.items('loc', query);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'oi1',
      source: 'SALE',
      orderId: 'o1',
      clientId: null,
    });
    expect(items[0].discounts.toFixed(2)).toBe('2.00');
    expect(items[0].changes[0].reason).toBe(PriceChangeReason.PROMOTION);
  });

  it('counts the candidates with the same where', async () => {
    db.orderItem.count.mockResolvedValue(7);
    expect(await service.countCandidates('loc', query)).toBe(7);
    const { where } = db.orderItem.count.mock.calls[0][0];
    expect(where.order.OR).toEqual([
      { bookingId: null },
      { booking: { deletedAt: null } },
    ]);
    expect(where.OR).toBeDefined();
  });

  it('counts none for the surcharge reason (product lines have no surcharges), without a query', async () => {
    const surcharge = { ...query, reason: PriceChangeReason.SURCHARGE };
    expect(await service.countCandidates('loc', surcharge)).toBe(0);
    expect(await service.items('loc', surcharge)).toEqual([]);
    expect(db.orderItem.count).not.toHaveBeenCalled();
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
  });
});
