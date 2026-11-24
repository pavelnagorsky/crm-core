import { MetricsService } from '../metrics/metrics.service.js';
import { metricValue } from '../metrics/testing/metric-value.js';
import { RedisMetrics } from './redis.metrics.js';
import { RedisService } from './redis.service.js';

describe('RedisMetrics', () => {
  it('reports whether Redis is available at the moment of the scrape', async () => {
    const redis = { available: true };
    const { registry } = new MetricsService();
    new RedisMetrics(redis as RedisService, { registry });

    expect(await metricValue(registry, 'klendo_redis_available')).toBe(1);
    redis.available = false;
    expect(await metricValue(registry, 'klendo_redis_available')).toBe(0);
  });
});
