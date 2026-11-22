import { InjectionToken, Provider, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStateConfig } from '../../config/interfaces/state-config.interface.js';
import { StateBackend } from '../enums/state-backend.enum.js';

/**
 * Binds the port `token` to the adapter of the configured `state.backend` (memory when the config has no `state`
 * section, as in tests that do not load `configuration.ts`).
 *
 * `adapters` names one adapter for every `StateBackend` value, so a new value does not compile until each feature
 * picks an adapter for it, and a value without one fails startup instead of quietly landing in process memory.
 * `state.backend` is one global switch for all shared state: a cache-only variant (e.g. a tiered L1/L2 cache, see
 * docs/replication-plan.md, section 5) gets its own cache setting rather than a new `StateBackend` value.
 *
 * All adapters are plain providers of the module, so Nest builds and shuts them down as usual; their constructors
 * must not start work (timers start lazily, Redis adapters only hold `RedisService`). The token is a factory that
 * returns one of them. Nest calls lifecycle hooks on factory results too, so adapter hooks must be idempotent.
 */
export function stateStoreProviders<T>(
  token: InjectionToken,
  adapters: Record<StateBackend, Type<T>>,
): Provider[] {
  const backends = Object.values(StateBackend);
  const classes = backends.map((backend) => adapters[backend]);
  return [
    ...new Set(classes),
    {
      provide: token,
      inject: [ConfigService, ...classes],
      useFactory: (config: ConfigService, ...instances: T[]): T => {
        const backend =
          config.get<IStateConfig>('state')?.backend ?? StateBackend.MEMORY;
        const index = backends.indexOf(backend);
        if (index < 0 || !instances[index])
          throw new Error(
            `No ${String(token)} adapter for state backend "${String(backend)}"`,
          );
        return instances[index];
      },
    },
  ];
}
