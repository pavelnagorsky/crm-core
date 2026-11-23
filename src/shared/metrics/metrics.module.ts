import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsServer } from './metrics.server.js';
import { MetricsService } from './metrics.service.js';

/**
 * Prometheus metrics of the process (docs/metrics.md): the registry, the internal `/metrics` server and HTTP
 * request metrics. Global like the database and Redis: modules register their metrics in `MetricsService`.
 */
@Global()
@Module({
  providers: [MetricsService, MetricsServer],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*path}');
  }
}
