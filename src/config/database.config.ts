const DEFAULT_POOL_SIZE = 10;

/**
 * `DATABASE_POOL_SIZE`, the Prisma connection pool of one process, 10 when missing.
 * A value that is not a positive integer fails startup instead of silently falling back.
 */
export function databasePoolSize(env: NodeJS.ProcessEnv = process.env): number {
  const value = env['DATABASE_POOL_SIZE']?.trim();
  if (!value) return DEFAULT_POOL_SIZE;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1)
    throw new Error(
      `DATABASE_POOL_SIZE must be a positive integer, got "${env['DATABASE_POOL_SIZE']}"`,
    );
  return size;
}
