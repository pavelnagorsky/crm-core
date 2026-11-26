import { Prisma } from '@prisma/client';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../enums/price-analytics-source.enum.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsItem } from '../interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsService } from './price-analytics.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const FROM = new Date('2026-11-01T00:00:00Z');
const TO = new Date('2026-12-01T00:00:00Z');
const NOW = new Date('2026-11-26T10:00:00Z');

const item = (id: string, over: Partial<PriceAnalyticsItem> = {}): PriceAnalyticsItem => ({
  id,
  itemType: PriceAnalyticsItemType.SERVICE,
  source: PriceAnalyticsSource.BOOKING,
  bookingId: `b-${id}`,
  orderId: null,
  at: new Date('2026-11-10T10:00:00Z'),
  title: 'Стрижка',
  quantity: null,
  clientId: `c-${id}`,
  clientName: 'Мария',
  staffId: null,
  staffName: null,
  returned: false,
  regular: d('40'),
  surcharges: d('0'),
  discounts: d('4'),
  received: d('36'),
  changes: [
    {
      reason: PriceChangeReason.CLIENT_DISCOUNT,
      ruleId: null,
      name: 'Скидка клиента',
      valueType: null,
      value: null,
      amount: d('4'),
    },
  ],
  ...over,
});

describe('PriceAnalyticsService', () => {
  const ranges = { resolve: vi.fn() };
  const bookings = {
    getPriceAnalyticsItems: vi.fn(),
    countPriceAnalyticsCandidates: vi.fn(),
  };
  const orders = {
    getPriceAnalyticsItems: vi.fn(),
    countPriceAnalyticsCandidates: vi.fn(),
  };
  const rules = { listByIds: vi.fn() };
  const staff = { listInLocation: vi.fn() };
  const service = new PriceAnalyticsService(
    ranges as never,
    bookings as never,
    orders as never,
    rules as never,
    staff as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    ranges.resolve.mockResolvedValue({
      from: FROM,
      to: TO,
      previousFrom: FROM,
      previousTo: FROM,
      compareWithPrevious: false,
      currency: 'BYN',
      timezone: 'Europe/Minsk',
    });
    rules.listByIds.mockResolvedValue([]);
    staff.listInLocation.mockResolvedValue([]);
    bookings.getPriceAnalyticsItems.mockResolvedValue([]);
    orders.getPriceAnalyticsItems.mockResolvedValue([]);
  });

  describe('exportItems', () => {
    it('refuses a clearly too large period by the candidate count, without loading any row', async () => {
      bookings.countPriceAnalyticsCandidates.mockResolvedValue(60_000);
      orders.countPriceAnalyticsCandidates.mockResolvedValue(40_001);
      await expect(
        service.exportItems('loc', { period: 'LAST_30D' } as never, NOW),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_ANALYTICS_EXPORT_TOO_LARGE',
        payload: { limit: 50_000 },
      });
      expect(bookings.getPriceAnalyticsItems).not.toHaveBeenCalled();
      expect(orders.getPriceAnalyticsItems).not.toHaveBeenCalled();
      expect(bookings.countPriceAnalyticsCandidates).toHaveBeenCalledWith(
        'loc',
        expect.objectContaining({ from: FROM, to: TO, now: NOW, changedOnly: true }),
      );
    });

    it('loads within the margin and keeps the exact check on the computed items', async () => {
      bookings.countPriceAnalyticsCandidates.mockResolvedValue(70_000);
      orders.countPriceAnalyticsCandidates.mockResolvedValue(0);
      bookings.getPriceAnalyticsItems.mockResolvedValue(
        Array.from({ length: 50_001 }, (_, index) => item(String(index))),
      );
      await expect(
        service.exportItems('loc', { period: 'LAST_30D' } as never, NOW),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_ANALYTICS_EXPORT_TOO_LARGE',
        payload: { limit: 50_000 },
      });
      expect(bookings.getPriceAnalyticsItems).toHaveBeenCalledTimes(1);
    });

    it('exports a small period', async () => {
      bookings.countPriceAnalyticsCandidates.mockResolvedValue(1);
      orders.countPriceAnalyticsCandidates.mockResolvedValue(0);
      bookings.getPriceAnalyticsItems.mockResolvedValue([item('1')]);
      const data = await service.exportItems(
        'loc',
        { period: 'LAST_30D' } as never,
        NOW,
      );
      expect(data.items).toHaveLength(1);
      expect(data.totals.itemsCount).toBe(1);
    });

    it('counts only the services for the service filter', async () => {
      bookings.countPriceAnalyticsCandidates.mockResolvedValue(1);
      bookings.getPriceAnalyticsItems.mockResolvedValue([]);
      await service.exportItems(
        'loc',
        { period: 'LAST_30D', itemType: PriceAnalyticsItemType.SERVICE } as never,
        NOW,
      );
      expect(orders.countPriceAnalyticsCandidates).not.toHaveBeenCalled();
    });

    it('the items list does not count candidates', async () => {
      bookings.getPriceAnalyticsItems.mockResolvedValue([item('1')]);
      orders.getPriceAnalyticsItems.mockResolvedValue([]);
      await service.items(
        'loc',
        { period: 'LAST_30D', page: 1, pageSize: 25 } as never,
        NOW,
      );
      expect(bookings.countPriceAnalyticsCandidates).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('counts the items with a discount and with a surcharge apart from the totals', async () => {
      const surcharge = {
        reason: PriceChangeReason.CUSTOM_PRICE_UP,
        ruleId: null,
        name: 'Своя цена',
        valueType: null,
        value: null,
        amount: d('5'),
      };
      bookings.getPriceAnalyticsItems.mockResolvedValue([
        item('1', { bookingId: 'b1', clientId: 'c1' }),
        item('2', { bookingId: 'b1', clientId: 'c1', changes: [surcharge] }),
      ]);
      orders.getPriceAnalyticsItems.mockResolvedValue([
        item('3', {
          itemType: PriceAnalyticsItemType.PRODUCT,
          source: PriceAnalyticsSource.SALE,
          bookingId: null,
          orderId: 'o1',
          clientId: null,
        }),
      ]);
      const summary = await service.summary(
        'loc',
        { period: 'LAST_30D', compareWithPrevious: false } as never,
        NOW,
      );
      expect(summary.totals).toMatchObject({ itemsCount: 3, bookingsCount: 1, salesCount: 1 });
      expect(summary.discountsCounts).toEqual({
        itemsCount: 2,
        bookingsCount: 1,
        salesCount: 1,
        clientsCount: 1,
      });
      expect(summary.surchargesCounts).toEqual({
        itemsCount: 1,
        bookingsCount: 1,
        salesCount: 0,
        clientsCount: 1,
      });
    });
  });
});
