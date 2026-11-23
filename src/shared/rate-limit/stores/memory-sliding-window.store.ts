import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { SlidingWindow } from '../interfaces/sliding-window.interface.js';
import { SlidingWindowStore } from '../interfaces/sliding-window-store.interface.js';

/** Keys over this are evicted oldest first (forgetting attempts only ever lets more through). */
const MAX_KEYS = 100_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Sliding windows in process memory (`state.backend=memory`): one process only. Same rules as the Redis script.
 *
 * Memory is bounded: a key's old attempts are cut on each attempt and a key without attempts is dropped; a sweep
 * every minute (an unref'd timer that starts with the first key, stops when none are left and on shutdown) drops
 * keys whose window has passed; at most `MAX_KEYS` keys, each with at most `limit` attempts.
 *
 * Time comes from `Date.now()`, so fake timers move the window.
 */
@Injectable()
export class MemorySlidingWindowStore
  implements SlidingWindowStore, OnApplicationShutdown
{
  /** In order of the last attempt: the first one is the oldest. */
  private readonly windows = new Map<string, SlidingWindow>();
  private sweepTimer: NodeJS.Timeout | undefined;

  /** Keys currently held. */
  get size(): number {
    return this.windows.size;
  }

  tryAcquire(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const window = this.windows.get(key) ?? { attempts: [], windowMs };
    window.windowMs = windowMs;
    prune(window, now);
    if (window.attempts.length >= limit) {
      if (window.attempts.length === 0) this.windows.delete(key);
      return Promise.resolve(false);
    }
    window.attempts.push(now);
    this.windows.delete(key);
    this.windows.set(key, window);
    if (this.windows.size > MAX_KEYS) this.evictOldest();
    this.startSweep();
    return Promise.resolve(true);
  }

  /** Cuts old attempts and drops keys left without any. */
  sweep(now = Date.now()): void {
    for (const [key, window] of this.windows) {
      prune(window, now);
      if (window.attempts.length === 0) this.windows.delete(key);
    }
    if (this.windows.size === 0) this.stopSweep();
  }

  onApplicationShutdown(): void {
    this.stopSweep();
  }

  private evictOldest(): void {
    while (this.windows.size > MAX_KEYS) {
      const oldest = this.windows.keys().next().value as string;
      this.windows.delete(oldest);
    }
  }

  private startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  private stopSweep(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }
}

/** Drops attempts at or before `now - windowMs`, like `ZREMRANGEBYSCORE key 0 now-window`. */
function prune(window: SlidingWindow, now: number): void {
  const threshold = now - window.windowMs;
  let expired = 0;
  while (
    expired < window.attempts.length &&
    window.attempts[expired] <= threshold
  )
    expired++;
  if (expired > 0) window.attempts.splice(0, expired);
}
