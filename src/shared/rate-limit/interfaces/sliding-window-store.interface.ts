/** Attempts per key in a sliding window, for domain rate limits. */
export interface SlidingWindowStore {
  /**
   * Records an attempt and resolves true when `key` had fewer than `limit` attempts in the last `windowMs`;
   * otherwise resolves false and records nothing. An attempt exactly `windowMs` old no longer counts.
   */
  tryAcquire(key: string, limit: number, windowMs: number): Promise<boolean>;
}
