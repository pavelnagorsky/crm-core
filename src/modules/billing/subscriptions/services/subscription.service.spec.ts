import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import {
  subscription,
  SubscriptionClientMock,
  subscriptionClients,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionService } from './subscription.service.js';

describe('SubscriptionService', () => {
  const cache = { invalidate: vi.fn() };
  let tx: SubscriptionClientMock;
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    const { db, tx: clientTx } = subscriptionClients();
    tx = clientTx;
    service = new SubscriptionService(db as never, cache as never);
  });

  describe('locks', () => {
    it('lockOrThrow without a row is SUBSCRIPTION_NOT_STARTED', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      const error = await service
        .lockOrThrow('brand-1', tx as never)
        .catch((e) => e);
      expect(error).toBeInstanceOf(AppException);
      expect(error.errorCode).toBe(ErrorCode.SUBSCRIPTION_NOT_STARTED.code);
      expect(tx.subscription.findUnique).not.toHaveBeenCalled();
    });

    it('lock reads the row after FOR UPDATE in the same transaction', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'sub-1' }]);
      tx.subscription.findUnique.mockResolvedValue(subscription());
      await expect(service.lock('brand-1', tx as never)).resolves.toMatchObject(
        { id: 'sub-1' },
      );
      expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
      expect(tx.$queryRaw.mock.calls[0][1]).toBe('brand-1');
    });
  });
});
