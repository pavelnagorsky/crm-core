import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service.js';
import { RedisService } from './redis.service.js';

/**
 * `klendo_redis_available`, read on every scrape. 0 means cache, rate limits and cron locks are running
 * without Redis (fail-open) — or that `REDIS_URL` is not set.
 */
@Injectable()
export class RedisMetrics {
  constructor(redis: RedisService, { registry }: MetricsService) {
    new Gauge({
      name: 'klendo_redis_available',
      help: '1 when Redis answers, 0 when the application works without it.',
      registers: [registry],
      collect() {
        this.set(redis.available ? 1 : 0);
      },
    });
  }
}
