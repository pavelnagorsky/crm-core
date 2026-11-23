import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StateBackend } from '../enums/state-backend.enum.js';
import { stateStoreProviders } from './state-store.providers.js';

const STORE = Symbol('STORE');

@Injectable()
class MemoryStore implements OnApplicationShutdown {
  shutdowns = 0;
  onApplicationShutdown(): void {
    this.shutdowns++;
  }
}

@Injectable()
class RedisStore {}

@Module({
  providers: stateStoreProviders(STORE, {
    [StateBackend.MEMORY]: MemoryStore,
    [StateBackend.REDIS]: RedisStore,
  }),
  exports: [STORE],
})
class StoreModule {}

async function compile(state?: { backend: string }) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true,
        load: [() => (state ? { state } : {})],
      }),
      StoreModule,
    ],
  }).compile();
}

describe('stateStoreProviders', () => {
  it('binds the token to the Redis adapter for the redis backend', async () => {
    const app = await compile({ backend: StateBackend.REDIS });
    expect(app.get(STORE)).toBeInstanceOf(RedisStore);
    expect(app.get(STORE)).toBe(app.get(RedisStore));
    await app.close();
  });

  it('binds the token to the memory adapter for the memory backend', async () => {
    const app = await compile({ backend: StateBackend.MEMORY });
    expect(app.get(STORE)).toBe(app.get(MemoryStore));
    await app.close();
  });

  it('falls back to memory when the backend is not configured', async () => {
    const app = await compile();
    expect(app.get(STORE)).toBeInstanceOf(MemoryStore);
    await app.close();
  });

  it('fails startup for a backend without an adapter instead of falling back to memory', async () => {
    await expect(compile({ backend: 'tiered' })).rejects.toThrow(
      'adapter for state backend "tiered"',
    );
  });

  it('shuts the chosen adapter down (the hook may run once per provider)', async () => {
    const app = await compile({ backend: StateBackend.MEMORY });
    const store = app.get(MemoryStore);
    await app.close();
    expect(store.shutdowns).toBeGreaterThanOrEqual(1);
  });
});
