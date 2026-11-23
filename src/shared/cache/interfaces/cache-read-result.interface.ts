/** A hit when `payload` is present. `revision` is the current global revision, taken before a load on a miss. */
export interface CacheReadResult {
  revision: number;
  payload?: string;
  ttlMs?: number;
}
