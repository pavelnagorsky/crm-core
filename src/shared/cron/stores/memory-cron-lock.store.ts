import { Injectable } from '@nestjs/common';
import { CronLockStore } from '../interfaces/cron-lock-store.interface.js';

/** Same lifetime as the Redis lock. */
const LOCK_TTL_MS = 3600 * 1000;

/**
 * Cron locks in process memory (`state.backend=memory`): dedupes runs within this process only. Claimed slots
 * expire after an hour and are dropped on the next claim (a few crons × 60 slots at most), so no timer is needed.
 */
@Injectable()
export class MemoryCronLockStore implements CronLockStore {
  /** `<name>:<slot>` → expiry time in ms. */
  private readonly locks = new Map<string, number>();

  /** Slots currently held. */
  get size(): number {
    return this.locks.size;
  }

  tryAcquire(name: string, slot: number): Promise<boolean> {
    const now = Date.now();
    for (const [key, expiresAt] of this.locks)
      if (expiresAt <= now) this.locks.delete(key);
    const key = `${name}:${slot}`;
    if (this.locks.has(key)) return Promise.resolve(false);
    this.locks.set(key, now + LOCK_TTL_MS);
    return Promise.resolve(true);
  }
}
