import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { IMetricsConfig } from '../../config/interfaces/metrics-config.interface.js';

const METRICS_PATH = '/metrics';

/**
 * The process's Prometheus registry and the internal server that exposes it on `METRICS_HOST:METRICS_PORT`.
 * A separate server, not a route of the API: `/metrics` never goes through the load balancer, guards or rate limits.
 * The registry is per instance (not the prom-client global), so test apps never share series.
 * Metrics are not worth an outage: a server that fails to start is logged and the application runs on.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnApplicationShutdown {
  readonly registry = new Registry();
  private readonly logger = new Logger(MetricsService.name);
  private server: Server | undefined;

  constructor(private readonly config: ConfigService) {
    // CPU, memory, heap, GC, event loop lag, open handles.
    collectDefaultMetrics({ register: this.registry });
  }

  async onModuleInit(): Promise<void> {
    const { host, port } = this.config.getOrThrow<IMetricsConfig>('metrics');
    if (port === 0) return;

    const server = createServer((req, res) => void this.respond(req, res));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
    } catch (error) {
      this.logger.error(
        `Metrics are not served on ${host}:${port}: ${(error as Error).message}`,
      );
      return;
    }
    this.server = server;
    this.logger.log(`Metrics served on http://${host}:${port}${METRICS_PATH}`);
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async respond(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET' || req.url !== METRICS_PATH) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await this.registry.metrics();
      res
        .writeHead(200, { 'Content-Type': this.registry.contentType })
        .end(body);
    } catch (error) {
      this.logger.error(
        `Collecting metrics failed: ${(error as Error).message}`,
      );
      res.writeHead(500).end();
    }
  }
}
