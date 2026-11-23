/** Connections of the Prisma pool of this process. */
export interface IDatabasePoolStats {
  /** Open connections, idle or in use. At most `DATABASE_POOL_SIZE`. */
  total: number;
  idle: number;
  /** Queries waiting for a connection: above 0 the pool is exhausted. */
  waiting: number;
}
