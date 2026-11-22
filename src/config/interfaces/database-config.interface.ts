export interface IDatabaseConfig {
  url: string;
  /** Prisma connection pool of one process. */
  poolSize: number;
}
