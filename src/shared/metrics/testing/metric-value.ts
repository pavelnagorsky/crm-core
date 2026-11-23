import { Registry } from 'prom-client';

/**
 * The value of the series of `name` whose labels include `labels`, `undefined` when there is none.
 * For a histogram, `name` is a sample name: `<metric>_count`, `<metric>_sum` or `<metric>_bucket`.
 */
export async function metricValue(
  registry: Registry,
  name: string,
  labels: Record<string, string | number> = {},
): Promise<number | undefined> {
  const metrics = await registry.getMetricsAsJSON();
  for (const metric of metrics) {
    for (const value of metric.values as {
      metricName?: string;
      labels: Record<string, string | number>;
      value: number;
    }[]) {
      if ((value.metricName ?? metric.name) !== name) continue;
      if (Object.entries(labels).every(([k, v]) => value.labels[k] === v))
        return value.value;
    }
  }
  return undefined;
}
