import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsService } from './metrics.service.js';

/** Prometheus metrics of the process: runtime (CPU, memory, event loop) and HTTP requests. See docs/metrics.md. */
@Module({
  providers: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*path}');
  }
}
