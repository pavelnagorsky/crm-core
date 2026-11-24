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
import { Registry } from 'prom-client';
import { IMetricsConfig } from '../../config/interfaces/metrics-config.interface.js';
import { MetricsService } from './metrics.service.js';

const METRICS_PATH = '/metrics';

/**
 * The internal server that exposes the registry of `MetricsService` on `METRICS_HOST:METRICS_PORT`.
 * A separate server, not a route of the API: `/metrics` never goes through the load balancer, guards or rate limits.
 * Metrics are not worth an outage: a server that fails to start is logged and the application runs on.
 */
@Injectable()
export class MetricsServer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MetricsServer.name);
  private readonly registry: Registry;
  private server: Server | undefined;

  constructor(
    private readonly config: ConfigService,
    { registry }: MetricsService,
  ) {
    this.registry = registry;
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
