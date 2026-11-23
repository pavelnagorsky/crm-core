import { metricsHost, metricsPort } from './metrics.config.js';

describe('metricsPort', () => {
  it('defaults to 9464', () => {
    expect(metricsPort({})).toBe(9464);
    expect(metricsPort({ METRICS_PORT: ' ' })).toBe(9464);
  });

  it('reads the configured port, 0 included (disabled)', () => {
    expect(metricsPort({ METRICS_PORT: ' 9100 ' })).toBe(9100);
    expect(metricsPort({ METRICS_PORT: '0' })).toBe(0);
  });

  it.each(['-1', '65536', '94.64', 'off'])('rejects %s', (value) => {
    expect(() => metricsPort({ METRICS_PORT: value })).toThrow(
      `METRICS_PORT must be an integer from 0 to 65535, got "${value}"`,
    );
  });
});

describe('metricsHost', () => {
  it('defaults to loopback', () => {
    expect(metricsHost({})).toBe('127.0.0.1');
    expect(metricsHost({ METRICS_HOST: ' ' })).toBe('127.0.0.1');
  });

  it('reads the configured host', () => {
    expect(metricsHost({ METRICS_HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});
