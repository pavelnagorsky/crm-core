import { CacheNamespace } from '../enums/cache-namespace.enum.js';
import { CachePolicy } from './cache-policy.interface.js';

export interface CacheDefinition<Context, Value> {
  namespace: CacheNamespace;
  identity: (context: Context) => readonly string[];
  dependencies: (context: Context, value?: Value) => readonly string[];
  policy: CachePolicy;
  isUsable?: (value: Value, context: Context) => boolean;
}
