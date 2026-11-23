import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:net';
import { MetricsService } from './metrics.service.js';

const HOST = '127.0.0.1';

function serviceOn(port: number): MetricsService {
  return new MetricsService(
    new ConfigService({ metrics: { host: HOST, port } }),
  );
}

/** A port that was free a moment ago. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('MetricsService', () => {
  const started: MetricsService[] = [];

  async function start(port: number): Promise<MetricsService> {
    const service = serviceOn(port);
    started.push(service);
    await service.onModuleInit();
    return service;
  }

  afterEach(async () => {
    await Promise.all(started.map((s) => s.onApplicationShutdown()));
    started.length = 0;
  });

  it('serves the registry on /metrics, with runtime metrics', async () => {
    const port = await freePort();
    await start(port);

    const res = await fetch(`http://${HOST}:${port}/metrics`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('process_cpu_seconds_total');
    expect(body).toContain('nodejs_eventloop_lag_p99_seconds');
  });

  it('answers 404 to anything but GET /metrics', async () => {
    const port = await freePort();
    await start(port);

    expect((await fetch(`http://${HOST}:${port}/`)).status).toBe(404);
    expect(
      (await fetch(`http://${HOST}:${port}/metrics`, { method: 'POST' }))
        .status,
    ).toBe(404);
  });

  it('keeps the application running when the port is taken', async () => {
    const port = await freePort();
    await start(port);

    await expect(start(port)).resolves.toBeInstanceOf(MetricsService);
  });

  it('starts no server on port 0', async () => {
    const service = await start(0);

    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it('keeps a separate registry per instance', () => {
    expect(serviceOn(0).registry).not.toBe(serviceOn(0).registry);
  });
});
