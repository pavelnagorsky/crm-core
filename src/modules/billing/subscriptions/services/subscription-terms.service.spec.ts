import { SubscriptionEventType } from '@prisma/client';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  minsk,
  recordedEvents,
  subscription,
  SubscriptionClientMock,
  subscriptionClients,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionTermsService } from './subscription-terms.service.js';
import { SubscriptionService } from './subscription.service.js';

describe('SubscriptionTermsService', () => {
  const actor = BillingActors.admin('admin-1');
  const cache = { invalidate: vi.fn() };
  let tx: SubscriptionClientMock;
  let service: SubscriptionTermsService;

  const events = () => recordedEvents(tx);

  beforeEach(() => {
    vi.clearAllMocks();
    const { db, tx: clientTx } = subscriptionClients();
    tx = clientTx;
    tx.$queryRaw.mockResolvedValue([{ id: 'sub-1' }]);
    service = new SubscriptionTermsService(
      db as never,
      new SubscriptionService(db as never, cache as never),
      new SubscriptionEventService(db as never),
    );
  });

  describe('extendTrial', () => {
    it('extendTrial extends an ended trial from today', async () => {
      tx.subscription.findUnique.mockResolvedValue(subscription());
      const now = new Date('2026-12-10T09:00:00Z');

      await service.extendTrial('brand-1', 5, 'promo', actor, now);

      expect(tx.subscription.update.mock.calls[0][0].data).toMatchObject({
        trialEndsAt: minsk('2026-12-15'),
        accessEndsAt: minsk('2026-12-15'),
        graceExtendedUntil: null,
      });
      expect(events()[0]).toMatchObject({
        type: SubscriptionEventType.TRIAL_EXTENDED,
        payload: { days: 5, reason: 'promo' },
      });
      expect(cache.invalidate).toHaveBeenCalledTimes(1);
    });

    it('extendTrial adds to a running trial and keeps a later paidUntil', async () => {
      tx.subscription.findUnique.mockResolvedValue(
        subscription({
          paidUntil: minsk('2027-01-01'),
          accessEndsAt: minsk('2027-01-01'),
        }),
      );

      await service.extendTrial(
        'brand-1',
        5,
        'promo',
        actor,
        minsk('2026-11-20'),
      );

      expect(tx.subscription.update.mock.calls[0][0].data).toEqual({
        trialEndsAt: minsk('2026-12-06'),
        accessEndsAt: minsk('2027-01-01'),
      });
    });
  });

  describe('suspension', () => {
    it('suspend is idempotent', async () => {
      tx.subscription.findUnique.mockResolvedValue(
        subscription({
          suspendedAt: minsk('2026-11-10'),
          suspendReason: 'fraud',
        }),
      );
      await service.suspend('brand-1', 'again', actor);
      expect(tx.subscription.update).not.toHaveBeenCalled();
      expect(tx.subscriptionEvent.create).not.toHaveBeenCalled();
    });

    it('resume clears the suspension and records it', async () => {
      tx.subscription.findUnique.mockResolvedValue(
        subscription({
          suspendedAt: minsk('2026-11-10'),
          suspendReason: 'fraud',
        }),
      );
      await service.resume('brand-1', actor);
      expect(tx.subscription.update.mock.calls[0][0].data).toEqual({
        suspendedAt: null,
        suspendReason: null,
      });
      expect(events()[0]).toMatchObject({
        type: SubscriptionEventType.RESUMED,
        payload: { reason: 'fraud' },
      });
    });
  });
});
