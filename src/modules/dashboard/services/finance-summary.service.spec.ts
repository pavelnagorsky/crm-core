import { Prisma } from '@prisma/client';
import { PaymentTrackingMode } from '../../location/enums/payment-tracking-mode.enum.js';
import { FinanceSummaryService } from './finance-summary.service.js';

const from = new Date('2026-10-31T21:00:00.000Z');
const to = new Date('2026-11-07T21:00:00.000Z');
const listed = {
  items: [],
  count: 3,
  amount: new Prisma.Decimal('4500'),
};

function setup(mode: PaymentTrackingMode, since: Date) {
  const db = { $transaction: vi.fn((run: (tx: object) => unknown) => run({})) };
  const locations = {
    getLocale: vi.fn().mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    }),
    getPaymentTracking: vi.fn().mockResolvedValue({ mode, since }),
  };
  const paymentsAggregates = {
    moneyTotals: vi.fn().mockResolvedValue({ marker: 'money' }),
  };
  const ordersAggregates = { notSpecified: vi.fn().mockResolvedValue(listed) };
  const service = new FinanceSummaryService(
    db as never,
    locations as never,
    paymentsAggregates as never,
    ordersAggregates as never,
  );
  return { service, paymentsAggregates, ordersAggregates };
}

const request = { from: '2026-11-01', to: '2026-11-07' };

describe('FinanceSummaryService.summary', () => {
  it('lists nothing without a query while tracking is disabled; money stays', async () => {
    const { service, paymentsAggregates, ordersAggregates } = setup(
      PaymentTrackingMode.DISABLED,
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const summary = await service.summary('location-1', request);
    expect(ordersAggregates.notSpecified).not.toHaveBeenCalled();
    expect(summary.notSpecified.items).toEqual([]);
    expect(summary.notSpecified.count).toBe(0);
    expect(summary.notSpecified.amount.toFixed(2)).toBe('0.00');
    expect(paymentsAggregates.moneyTotals).toHaveBeenCalledWith(
      { locationId: 'location-1', from, to },
      {},
    );
    expect(summary.money).toEqual({ marker: 'money' });
  });

  it('lists from the tracking start inside the period, money over the whole period', async () => {
    const since = new Date('2026-11-03T09:30:00.000Z');
    const { service, paymentsAggregates, ordersAggregates } = setup(
      PaymentTrackingMode.MANUAL,
      since,
    );
    const summary = await service.summary('location-1', request);
    expect(ordersAggregates.notSpecified).toHaveBeenCalledWith(
      { locationId: 'location-1', from: since, to },
      20,
      {},
    );
    expect(paymentsAggregates.moneyTotals).toHaveBeenCalledWith(
      { locationId: 'location-1', from, to },
      {},
    );
    expect(summary.notSpecified).toBe(listed);
  });

  it('lists the whole period when tracking started before it', async () => {
    const { service, ordersAggregates } = setup(
      PaymentTrackingMode.MANUAL,
      new Date('2026-10-01T00:00:00.000Z'),
    );
    await service.summary('location-1', request);
    expect(ordersAggregates.notSpecified).toHaveBeenCalledWith(
      { locationId: 'location-1', from, to },
      20,
      {},
    );
  });

  it('lists nothing when tracking starts after the period', async () => {
    const { service, ordersAggregates } = setup(
      PaymentTrackingMode.MANUAL,
      new Date('2026-11-10T00:00:00.000Z'),
    );
    const summary = await service.summary('location-1', request);
    expect(ordersAggregates.notSpecified).not.toHaveBeenCalled();
    expect(summary.notSpecified.count).toBe(0);
  });
});
