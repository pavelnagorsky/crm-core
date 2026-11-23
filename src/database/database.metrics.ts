import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { MetricsService } from '../shared/metrics/metrics.service.js';
import { DatabaseService } from './database.service.js';

/** `klendo_db_pool_connections{state}`, read on every scrape. `waiting` above 0 means the pool is exhausted. */
@Injectable()
export class DatabaseMetrics {
  constructor(database: DatabaseService, { registry }: MetricsService) {
    new Gauge({
      name: 'klendo_db_pool_connections',
      help: 'Connections of the Prisma pool: total open, idle, and queries waiting for one.',
      labelNames: ['state'],
      registers: [registry],
      collect() {
        const { total, idle, waiting } = database.poolStats;
        this.set({ state: 'total' }, total);
        this.set({ state: 'idle' }, idle);
        this.set({ state: 'waiting' }, waiting);
      },
    });
  }
}
