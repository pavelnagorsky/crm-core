import { redisUrl } from './redis.config.js';

describe('redisUrl', () => {
  it('returns the configured url', () => {
    expect(redisUrl({ REDIS_URL: ' redis://localhost:6379 ' })).toBe(
      'redis://localhost:6379',
    );
  });

  it('is optional outside production', () => {
    expect(redisUrl({ NODE_ENV: 'development' })).toBeUndefined();
    expect(redisUrl({ REDIS_URL: ' ' })).toBeUndefined();
  });

  it('is required in production', () => {
    expect(() => redisUrl({ NODE_ENV: 'production' })).toThrow(
      'REDIS_URL is required when NODE_ENV=production',
    );
  });
});
