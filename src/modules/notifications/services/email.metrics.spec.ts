import { MetricsService } from '../../../shared/metrics/metrics.service.js';
import { metricValue } from '../../../shared/metrics/testing/metric-value.js';
import { EmailMetrics } from './email.metrics.js';

describe('EmailMetrics', () => {
  const sends = (metrics: MetricsService, result: string) =>
    metricValue(metrics.registry, 'klendo_email_send_duration_seconds_count', {
      result,
    });

  it('counts a successful send and passes its result through', async () => {
    const metrics = new MetricsService();
    const emails = new EmailMetrics(metrics);

    await expect(emails.track(async () => '<id@smtp>')).resolves.toBe(
      '<id@smtp>',
    );

    expect(await sends(metrics, 'sent')).toBe(1);
    expect(await sends(metrics, 'failed')).toBeUndefined();
  });

  it('counts a failed send and passes its error through', async () => {
    const metrics = new MetricsService();
    const emails = new EmailMetrics(metrics);

    await expect(
      emails.track(async () => {
        throw new Error('Connection closed');
      }),
    ).rejects.toThrow('Connection closed');

    expect(await sends(metrics, 'failed')).toBe(1);
  });
});
