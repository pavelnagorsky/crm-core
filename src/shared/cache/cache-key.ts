import { CacheNamespace } from './enums/cache-namespace.enum.js';

export function cacheKey(
  namespace: CacheNamespace,
  identity: readonly string[],
): string {
  return [namespace, ...identity.map(encodeURIComponent)].join(':');
}
