import { CacheDefinition } from './interfaces/cache-definition.interface.js';

export function defineCache<C, V>(
  definition: CacheDefinition<C, V>,
): CacheDefinition<C, V> {
  const { ttlMs, refreshAheadMs } = definition.policy;
  if (ttlMs <= 0 || refreshAheadMs < 0 || refreshAheadMs >= ttlMs) {
    throw new Error(`Invalid cache policy: ${definition.namespace}`);
  }
  return definition;
}
