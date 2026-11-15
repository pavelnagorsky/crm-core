import { BadRequestException } from '@nestjs/common';
import { BillingActorRole, SubscriptionEventType } from '@prisma/client';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  BILLING_SETTINGS,
  minsk,
  recordedEvents,
  subscription,
  SubscriptionClientMock,
  subscriptionClients,
  TZ,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionStartService } from './subscription-start.service.js';
import { SubscriptionService } from './subscription.service.js';

describe('SubscriptionStartService', () => {
  const settings = { read: vi.fn() };
  const cache = { invalidate: vi.fn() };
  let db: SubscriptionClientMock;
  let tx: SubscriptionClientMock;
  let service: SubscriptionStartService;

  const events = () => recordedEvents(tx);

  beforeEach(() => {
    vi.clearAllMocks();
    ({ db, tx } = subscriptionClients());
    settings.read.mockResolvedValue({ ...BILLING_SETTINGS });
    service = new SubscriptionStartService(
      db as never,
      new SubscriptionService(db as never, cache as never),
      new SubscriptionEventService(db as never),
      settings as never,
    );
  });

  describe('start', () => {
    const origin = { countryCode: 'BY', timezone: TZ };
    const now = new Date('2026-11-15T09:00:00Z');

    it('does nothing before the launch', async () => {
      settings.read.mockResolvedValue({
        ...BILLING_SETTINGS,
        launchedAt: null,
      });
      await service.start('brand-1', 'owner-1', origin, tx as never, now);
      expect(settings.read).toHaveBeenCalledWith(tx);
      expect(tx.subscription.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.subscription.create).not.toHaveBeenCalled();
    });

    it('starts a trial from the local day start, inside the brand transaction', async () => {
      tx.subscription.createManyAndReturn.mockImplementation(
        async ({ data }) => data,
      );

      await service.start('brand-1', 'owner-1', origin, tx as never, now);

      const trialEndsAt = minsk('2026-12-15');
      expect(tx.subscription.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            brandId: 'brand-1',
            countryCode: 'BY',
            timezone: TZ,
            trialStartedAt: now,
            trialUserId: 'owner-1',
            trialEndsAt,
            accessEndsAt: trialEndsAt,
          }),
        ],
        skipDuplicates: true,
      });
      expect(events()).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          type: SubscriptionEventType.TRIAL_STARTED,
          actorId: 'owner-1',
          actorRole: BillingActorRole.OWNER,
          payload: { trialEndsAt: trialEndsAt.toISOString() },
        }),
      ]);
      // Rolled back with the brand: nothing goes outside the given transaction.
      expect(db.subscription.createManyAndReturn).not.toHaveBeenCalled();
      expect(db.subscriptionEvent.create).not.toHaveBeenCalled();
    });

    it('a second brand of the owner starts without a trial', async () => {
      tx.subscription.createManyAndReturn.mockResolvedValue([]);
      tx.subscription.findFirst.mockResolvedValue({ brandId: 'first-brand' });
      tx.subscription.create.mockImplementation(async ({ data }) => ({
        id: 'sub-2',
        ...data,
      }));

      await service.start('brand-2', 'owner-1', origin, tx as never, now);

      const today = minsk('2026-11-15');
      expect(tx.subscription.findFirst).toHaveBeenCalledWith({
        where: { trialUserId: 'owner-1' },
        select: { brandId: true },
      });
      const { data } = tx.subscription.create.mock.calls[0][0];
      expect(data).toMatchObject({
        brandId: 'brand-2',
        trialEndsAt: today,
        accessEndsAt: today,
      });
      expect(data.trialUserId).toBeUndefined();
      expect(events()).toEqual([
        expect.objectContaining({
          type: SubscriptionEventType.TRIAL_SKIPPED,
          payload: { trialUsedInBrandId: 'first-brand' },
        }),
      ]);
    });

    it('a deleted first brand still keeps the trial spent', async () => {
      // The partial unique index on trialUserId ignores Brand.deletedAt.
      tx.subscription.createManyAndReturn.mockResolvedValue([]);
      tx.subscription.findFirst.mockResolvedValue({ brandId: 'deleted-brand' });
      tx.subscription.create.mockImplementation(async ({ data }) => ({
        id: 'sub-2',
        ...data,
      }));

      await service.start('brand-2', 'owner-1', origin, tx as never, now);

      expect(events()[0]).toMatchObject({
        type: SubscriptionEventType.TRIAL_SKIPPED,
        payload: { trialUsedInBrandId: 'deleted-brand' },
      });
    });
  });

  describe('startPilot', () => {
    const origin = { countryCode: 'BY', timezone: TZ };
    const now = new Date('2026-11-15T09:00:00Z');
    const actor = BillingActors.admin('admin-1');

    it('rejects a trial end in the past', async () => {
      await expect(
        service.startPilot('brand-1', origin, '2026-11-15', actor, now),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a brand that already has a subscription', async () => {
      tx.subscription.findUnique.mockResolvedValue(subscription());
      await expect(
        service.startPilot('brand-1', origin, '2027-01-01', actor, now),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_ALREADY_EXISTS.code,
      });
      expect(tx.subscription.create).not.toHaveBeenCalled();
    });

    it('creates the trial, records the pilot and resets the cache', async () => {
      tx.subscription.findUnique.mockResolvedValue(null);
      tx.subscription.create.mockImplementation(async ({ data }) => ({
        id: 'sub-1',
        ...data,
      }));
      db.subscription.findUnique.mockResolvedValue(subscription());

      await service.startPilot('brand-1', origin, '2027-01-01', actor, now);

      expect(tx.subscription.create.mock.calls[0][0].data).toMatchObject({
        trialEndsAt: minsk('2027-01-01'),
        accessEndsAt: minsk('2027-01-01'),
      });
      expect(events()[0]).toMatchObject({
        type: SubscriptionEventType.TRIAL_STARTED,
        actorRole: BillingActorRole.ADMIN,
        payload: { source: 'pilot' },
      });
      expect(cache.invalidate).toHaveBeenCalledTimes(1);
    });
  });

  describe('backfill', () => {
    const now = new Date('2026-11-15T09:00:00Z');
    const actor = BillingActors.system();
    const row = (brandId: string, trialUserId: string | null) => ({
      brandId,
      trialUserId,
      countryCode: 'BY',
      timezone: TZ,
    });

    it('inserts every row with a TRIAL_STARTED event', async () => {
      tx.subscription.createManyAndReturn.mockImplementation(
        async ({ data }) => data,
      );

      const count = await service.backfill(
        [row('b1', 'u1'), row('b2', null)],
        '2027-01-01',
        actor,
        now,
      );

      expect(count).toBe(2);
      expect(
        tx.subscription.createManyAndReturn.mock.calls[0][0],
      ).toMatchObject({
        skipDuplicates: true,
        data: [
          {
            brandId: 'b1',
            trialUserId: 'u1',
            trialEndsAt: minsk('2027-01-01'),
          },
          { brandId: 'b2', trialUserId: null },
        ],
      });
      const { data } = tx.subscriptionEvent.createMany.mock.calls[0][0];
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        brandId: 'b1',
        type: SubscriptionEventType.TRIAL_STARTED,
        actorRole: BillingActorRole.SYSTEM,
        payload: { source: 'launch' },
      });
    });

    it('re-inserts without trialUserId a row whose owner trial got taken meanwhile', async () => {
      tx.subscription.createManyAndReturn
        .mockImplementationOnce(async ({ data }) =>
          data.filter((d: { brandId: string }) => d.brandId === 'b1'),
        )
        .mockImplementationOnce(async ({ data }) => data);
      // b2 conflicted on trialUserId, b3 already had a subscription.
      db.subscription.findMany.mockResolvedValue([{ brandId: 'b3' }]);

      const count = await service.backfill(
        [row('b1', 'u1'), row('b2', 'u2'), row('b3', 'u3')],
        '2027-01-01',
        actor,
        now,
      );

      expect(count).toBe(2);
      expect(db.subscription.findMany).toHaveBeenCalledWith({
        where: { brandId: { in: ['b2', 'b3'] } },
        select: { brandId: true },
      });
      expect(tx.subscription.createManyAndReturn.mock.calls[1][0].data).toEqual(
        [expect.objectContaining({ brandId: 'b2', trialUserId: null })],
      );
    });

    it('a repeated run inserts nothing', async () => {
      tx.subscription.createManyAndReturn.mockResolvedValue([]);
      db.subscription.findMany.mockResolvedValue([{ brandId: 'b1' }]);

      await expect(
        service.backfill([row('b1', 'u1')], '2027-01-01', actor, now),
      ).resolves.toBe(0);
      expect(tx.subscription.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(tx.subscriptionEvent.createMany).not.toHaveBeenCalled();
    });
  });
});
