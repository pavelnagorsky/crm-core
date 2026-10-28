export interface CacheEntry<Value = unknown> {
  value: Value;
  dependencies: readonly string[];
  revision: number;
}
