import { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Behaviour every `ThrottlerStorage` adapter must have, run against the built-in `ThrottlerStorageService` in unit
 * tests and against `RedisThrottlerStorage` in e2e tests. `storage` returns an empty storage for each test.
 * `ttl` and `blockDuration` go in as milliseconds; times come back in seconds rounded up (they become `Retry-After`).
 */
export function throttlerStorageContract(
  storage: () => ThrottlerStorage,
): void {
  describe('ThrottlerStorage contract', () => {
    // `timeToBlockExpire` is read by the guard only for a blocked hit (`Retry-After`); the built-in storage returns
    // garbage there otherwise, so it is not part of the contract for allowed hits.
    it('counts hits in a window with its time to expire in seconds', async () => {
      expect(
        await storage().increment('ip', 60_000, 3, 60_000, 'n'),
      ).toMatchObject({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
      });
      expect(
        await storage().increment('ip', 60_000, 3, 60_000, 'n'),
      ).toMatchObject({ totalHits: 2, isBlocked: false });
    });

    it('blocks the hit over the limit for the block duration and stops counting', async () => {
      for (let i = 0; i < 3; i++)
        await storage().increment('ip', 1_000, 3, 10_000, 'burst');

      expect(
        await storage().increment('ip', 1_000, 3, 10_000, 'burst'),
      ).toEqual({
        totalHits: 4,
        timeToExpire: 1,
        isBlocked: true,
        timeToBlockExpire: 10,
      });
      const blocked = await storage().increment(
        'ip',
        1_000,
        3,
        10_000,
        'burst',
      );
      expect(blocked).toMatchObject({ totalHits: 4, isBlocked: true });
      expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
      expect(blocked.timeToBlockExpire).toBeLessThanOrEqual(10);
    });

    it('restarts the count after the block ends', async () => {
      for (let i = 0; i < 3; i++)
        await storage().increment('ip', 60_000, 2, 100, 'n');
      expect(
        (await storage().increment('ip', 60_000, 2, 100, 'n')).isBlocked,
      ).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(
        await storage().increment('ip', 60_000, 2, 100, 'n'),
      ).toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('without a block duration rejects the hit over the limit until the window ends', async () => {
      for (let i = 0; i < 2; i++)
        await storage().increment('ip', 60_000, 2, 0, 'n');

      const rejected = await storage().increment('ip', 60_000, 2, 0, 'n');
      expect(rejected).toMatchObject({ totalHits: 3, isBlocked: true });
      expect(rejected.timeToBlockExpire).toBe(60);
      // The rejected hit is not counted: the next one is rejected with the same total.
      expect(await storage().increment('ip', 60_000, 2, 0, 'n')).toMatchObject({
        totalHits: 3,
        isBlocked: true,
      });
    });

    it('allows hits again once the window ends', async () => {
      for (let i = 0; i < 2; i++)
        await storage().increment('ip', 100, 2, 0, 'n');
      expect((await storage().increment('ip', 100, 2, 0, 'n')).isBlocked).toBe(
        true,
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(await storage().increment('ip', 100, 2, 0, 'n')).toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
    });

    it('keeps keys of different throttlers apart', async () => {
      await storage().increment('ip', 60_000, 5, 0, 'a');
      await storage().increment('ip', 60_000, 5, 0, 'a');
      expect(
        (await storage().increment('ip', 60_000, 5, 0, 'b')).totalHits,
      ).toBe(1);
    });

    it('keeps different keys apart', async () => {
      await storage().increment('ip-1', 60_000, 5, 0, 'a');
      await storage().increment('ip-1', 60_000, 5, 0, 'a');
      expect(
        (await storage().increment('ip-2', 60_000, 5, 0, 'a')).totalHits,
      ).toBe(1);
    });
  });
}
