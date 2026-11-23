import { MetricsService } from '../shared/metrics/metrics.service.js';
import { metricValue } from '../shared/metrics/testing/metric-value.js';
import { DatabaseMetrics } from './database.metrics.js';
import { DatabaseService } from './database.service.js';

describe('DatabaseMetrics', () => {
  it('reports the pool connections at the moment of the scrape', async () => {
    const database = { poolStats: { total: 10, idle: 0, waiting: 4 } };
    const { registry } = new MetricsService();
    new DatabaseMetrics(database as DatabaseService, { registry });

    const value = (state: string) =>
      metricValue(registry, 'klendo_db_pool_connections', { state });
    expect(await value('total')).toBe(10);
    expect(await value('idle')).toBe(0);
    expect(await value('waiting')).toBe(4);

    database.poolStats = { total: 3, idle: 3, waiting: 0 };
    expect(await value('waiting')).toBe(0);
  });
});
