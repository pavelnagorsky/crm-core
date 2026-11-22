import { CacheStore } from '../interfaces/cache-store.interface.js';

/**
 * Behaviour every CacheStore adapter must have, run against `MemoryCacheStore` in unit tests and against
 * `RedisCacheStore` in e2e tests. `store` returns an empty store for each test. Uses real time.
 */
export function cacheStoreContract(store: () => CacheStore): void {
  describe('CacheStore contract', () => {
    it('is available', () => {
      expect(store().available).toBe(true);
    });

    it('misses an absent entry and reports the current revision', async () => {
      expect(await store().read('a')).toEqual({ revision: 0 });
      await store().invalidate('dep:x');
      await store().invalidate('dep:y');
      expect(await store().read('a')).toEqual({ revision: 2 });
    });

    it('writes and reads an entry with its remaining TTL', async () => {
      const payload = '{"name":"Анна\nline","n":1}';
      expect(
        await store().write('a', 0, ['dep:a', 'dep:b'], payload, 60_000),
      ).toBe(true);

      const read = await store().read('a');
      expect(read).toMatchObject({ revision: 0, payload });
      expect(read.ttlMs).toBeGreaterThan(59_000);
      expect(read.ttlMs).toBeLessThanOrEqual(60_000);
    });

    it('writes an entry without dependencies', async () => {
      expect(await store().write('a', 0, [], 'v', 60_000)).toBe(true);
      await store().invalidate('dep:a');
      expect(await store().read('a')).toMatchObject({
        revision: 1,
        payload: 'v',
      });
    });

    it('keeps entries apart by key', async () => {
      await store().write('a', 0, [], 'first', 60_000);
      await store().write('b', 0, [], 'second', 60_000);
      expect(await store().read('a')).toMatchObject({ payload: 'first' });
      expect(await store().read('b')).toMatchObject({ payload: 'second' });
    });

    it('expires entries by TTL', async () => {
      await store().write('a', 0, ['dep:a'], 'v', 50);
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(await store().read('a')).toEqual({ revision: 0 });
    });

    it('drops an entry whose dependency was invalidated', async () => {
      await store().write('a', 0, ['dep:a', 'dep:b'], 'v', 60_000);
      await store().invalidate('dep:b');

      expect(await store().read('a')).toEqual({ revision: 1 });
      // Dropped for good: a later unrelated change does not bring it back.
      expect(await store().read('a')).toEqual({ revision: 1 });
    });

    it('keeps an entry when an unrelated dependency is invalidated', async () => {
      await store().write('a', 0, ['dep:a'], 'v', 60_000);
      await store().invalidate('dep:other');

      expect(await store().read('a')).toMatchObject({
        revision: 1,
        payload: 'v',
      });
    });

    it('rejects a write whose load started before an invalidation', async () => {
      const { revision } = await store().read('a');
      await store().invalidate('dep:a');

      expect(await store().write('a', revision, ['dep:a'], 'old', 60_000)).toBe(
        false,
      );
      expect(await store().read('a')).toEqual({ revision: 1 });

      const { revision: current } = await store().read('a');
      expect(await store().write('a', current, ['dep:a'], 'new', 60_000)).toBe(
        true,
      );
      expect(await store().read('a')).toMatchObject({ payload: 'new' });
    });

    it('accepts a write when only an unrelated dependency changed during the load', async () => {
      const { revision } = await store().read('a');
      await store().invalidate('dep:other');

      expect(await store().write('a', revision, ['dep:a'], 'v', 60_000)).toBe(
        true,
      );
    });

    it('rejects a write from a revision the store has not reached', async () => {
      expect(await store().write('a', 5, ['dep:a'], 'v', 60_000)).toBe(false);
      expect(await store().read('a')).toEqual({ revision: 0 });
    });

    it('replaces an entry with fewer dependencies', async () => {
      await store().write('a', 0, ['dep:a', 'dep:b'], 'first', 60_000);
      await store().write('a', 0, ['dep:a'], 'second', 60_000);
      await store().invalidate('dep:b');

      expect(await store().read('a')).toMatchObject({ payload: 'second' });
    });

    it('invalidates a dependency again after a newer write', async () => {
      await store().invalidate('dep:a');
      await store().write('a', 1, ['dep:a'], 'v', 60_000);
      expect(await store().read('a')).toMatchObject({ payload: 'v' });

      await store().invalidate('dep:a');
      expect(await store().read('a')).toEqual({ revision: 2 });
    });
  });
}
