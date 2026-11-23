/**
 * Where shared state (cache, rate limit counters, cron locks) lives. Every such feature has one adapter per value
 * and picks it with `stateStoreProviders`.
 */
export enum StateBackend {
  /** In the process: fully working, but each process has its own state. Local `start:dev` without Redis, tests. */
  MEMORY = 'memory',
  /** In Redis, shared by all replicas. Fail-open while Redis is down. */
  REDIS = 'redis',
}
