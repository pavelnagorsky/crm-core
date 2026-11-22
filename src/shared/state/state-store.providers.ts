import { InjectionToken, Provider, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStateConfig } from '../../config/interfaces/state-config.interface.js';
import { StateBackend } from '../enums/state-backend.enum.js';

/**
 * Binds the port `token` to the adapter of the configured `state.backend` (memory when unset).
 *
 * Both adapters are plain providers of the module, so Nest builds and shuts them down as usual; their constructors
 * must not start work (timers start lazily, Redis adapters only hold `RedisService`). The token is a factory that
 * returns one of them. Nest calls lifecycle hooks on factory results too, so adapter hooks must be idempotent.
 * A further backend (e.g. a tiered L1/L2 cache) is one more adapter and one more branch here.
 */
export function stateStoreProviders<T>(
  token: InjectionToken,
  memory: Type<T>,
  redis: Type<T>,
): Provider[] {
  return [
    memory,
    redis,
    {
      provide: token,
      inject: [ConfigService, memory, redis],
      useFactory: (config: ConfigService, memoryStore: T, redisStore: T): T =>
        config.get<IStateConfig>('state')?.backend === StateBackend.REDIS
          ? redisStore
          : memoryStore,
    },
  ];
}
