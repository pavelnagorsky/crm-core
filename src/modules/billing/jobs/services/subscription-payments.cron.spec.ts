import { SubscriptionPaymentsCron } from './subscription-payments.cron.js';

describe('SubscriptionPaymentsCron', () => {
  const payments = { expireDue: vi.fn() };
  const cron = new SubscriptionPaymentsCron(payments as never);
  const now = new Date('2026-11-15T09:05:00Z');

  beforeEach(() => vi.clearAllMocks());

  it('expires due requests and returns their number', async () => {
    payments.expireDue.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    await expect(cron.expireDue(now)).resolves.toBe(2);
    expect(payments.expireDue).toHaveBeenCalledWith(now);
  });

  it('returns 0 when nothing is due', async () => {
    payments.expireDue.mockResolvedValue([]);
    await expect(cron.expireDue(now)).resolves.toBe(0);
  });
});
