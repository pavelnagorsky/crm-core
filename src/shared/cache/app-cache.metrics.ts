import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service.js';
import { CacheNamespace } from './enums/cache-namespace.enum.js';
import { CacheReadResult } from './enums/cache-read-result.enum.js';

/** `klendo_cache_reads_total{namespace, result}`: hit ratio and fail-open reads of the shared cache. */
@Injectable()
export class AppCacheMetrics {
  private readonly reads: Counter<'namespace' | 'result'>;

  constructor({ registry }: MetricsService) {
    this.reads = new Counter({
      name: 'klendo_cache_reads_total',
      help: 'Reads of the shared cache by namespace and how they were served.',
      labelNames: ['namespace', 'result'],
      registers: [registry],
    });
  }

  read(namespace: CacheNamespace, result: CacheReadResult): void {
    this.reads.inc({ namespace, result });
  }
}
