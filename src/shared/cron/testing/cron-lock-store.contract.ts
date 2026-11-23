import { CronLockStore } from '../interfaces/cron-lock-store.interface.js';

/**
 * Behaviour every CronLockStore adapter must have, run against `MemoryCronLockStore` in unit tests and against
 * `RedisCronLockStore` in e2e tests. `store` returns an empty store for each test.
 */
export function cronLockStoreContract(store: () => CronLockStore): void {
  describe('CronLockStore contract', () => {
    const slot = 29_740_000;

    it('gives a slot to the first claimant only', async () => {
      expect(await store().tryAcquire('Jobs.run', slot)).toBe(true);
      expect(await store().tryAcquire('Jobs.run', slot)).toBe(false);
      expect(await store().tryAcquire('Jobs.run', slot)).toBe(false);
    });

    it('gives the next slot again', async () => {
      await store().tryAcquire('Jobs.run', slot);
      expect(await store().tryAcquire('Jobs.run', slot + 1)).toBe(true);
    });

    it('keeps crons apart', async () => {
      await store().tryAcquire('Jobs.run', slot);
      expect(await store().tryAcquire('Jobs.other', slot)).toBe(true);
    });
  });
}
