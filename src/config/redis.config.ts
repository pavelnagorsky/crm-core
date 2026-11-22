/**
 * `REDIS_URL`, required in production: without Redis every replica would keep its own cache and rate limits.
 * Elsewhere it may be missing, and the application runs without Redis (see `RedisService`).
 */
export function redisUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const url = env['REDIS_URL']?.trim() || undefined;
  if (!url && env['NODE_ENV'] === 'production')
    throw new Error('REDIS_URL is required when NODE_ENV=production');
  return url;
}
