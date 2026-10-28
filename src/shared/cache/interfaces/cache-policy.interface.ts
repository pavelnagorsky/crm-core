export interface CachePolicy {
  ttlMs: number;
  refreshAheadMs: number;
  warmup: boolean;
}
