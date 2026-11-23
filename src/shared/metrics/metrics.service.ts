import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';

/**
 * The process's Prometheus registry, with runtime metrics (CPU, memory, heap, GC, event loop lag, open handles).
 * Modules register their own metrics in it (`registers: [registry]`), next to the code that counts them.
 * Per instance, not the prom-client global registry, so test apps never share series.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
