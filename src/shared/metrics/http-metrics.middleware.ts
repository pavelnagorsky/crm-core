import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Gauge, Histogram } from 'prom-client';
import regularExpressions from '../regular-expressions.js';
import { MetricsService } from './metrics.service.js';

type RequestLabel = 'method' | 'route' | 'status_class';

/** The `route` of requests that matched no handler: one series for all of them, whatever the path. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * Duration and count of HTTP requests, by route template (`/public/locations/:id/bookings`), never the real path:
 * ids in labels would create a new series per entity. Runs as middleware, not an interceptor, so responses from
 * guards (401, 403, 429) and unmatched routes (404) are counted too. Requests the client abandoned before the
 * response was sent are left out of the duration (they have no status).
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  private readonly duration: Histogram<RequestLabel>;
  private readonly inFlight: Gauge;

  constructor({ registry }: MetricsService) {
    this.duration = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'Duration of HTTP requests, from routing to the last byte of the response.',
      labelNames: ['method', 'route', 'status_class'],
      registers: [registry],
    });
    this.inFlight = new Gauge({
      name: 'http_server_requests_in_flight',
      help: 'HTTP requests being processed.',
      registers: [registry],
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const end = this.duration.startTimer();
    this.inFlight.inc();
    res.once('close', () => {
      this.inFlight.dec();
      if (!res.writableFinished) return;
      end({
        method: req.method,
        route: routeTemplate(req),
        status_class: `${Math.floor(res.statusCode / 100)}xx`,
      });
    });
    next();
  }
}

/**
 * The template of the route that handled the request: Express keeps the last route it entered on `req.route`.
 * Nest mounts module middleware as routes too (nestjs-pino: `app.all('{/*splat}')`), so when no controller matched,
 * `req.route` is that middleware's catch-all. Controllers never register a catch-all route.
 */
function routeTemplate(req: Request): string {
  const path: unknown = req.route?.path;
  if (typeof path !== 'string' || regularExpressions.catchAllRoute.test(path))
    return UNMATCHED_ROUTE;
  return `${req.baseUrl}${path}`;
}
