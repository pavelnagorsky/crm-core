import { TokenEpochRegistryService } from './token-epoch-registry.service.js';

describe('Token epoch invalidation', () => {
  it('invalidates a freshly issued token even when two changes happen in the same millisecond', async () => {
    const values = new Map<string, number>();
    const cache = {
      get: async (key: string) => values.get(key),
      set: async (key: string, value: number) => {
        values.set(key, value);
      },
    };
    const registry = new TokenEpochRegistryService(cache as never);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      await registry.bump('user');
      const issuedVersion = await registry.get('user');
      await registry.bump('user');
      expect(await registry.get('user')).toBeGreaterThan(issuedVersion);
    } finally {
      clock.mockRestore();
    }
  });
});
