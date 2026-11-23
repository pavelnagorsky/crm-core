import {
  CanActivate,
  Controller,
  Get,
  INestApplication,
  InternalServerErrorException,
  MiddlewareConsumer,
  Module,
  NestModule,
  Param,
  RequestMethod,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MetricsModule } from './metrics.module.js';
import { MetricsService } from './metrics.service.js';

/** Mounts a middleware the way nestjs-pino does: an `app.all('{/*splat}')` route that every request enters. */
@Module({})
class CatchAllMiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_req: unknown, _res: unknown, next: () => void) => next())
      .forRoutes({ path: '{/*splat}', method: RequestMethod.ALL });
  }
}

class DenyGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller('items')
class ItemsController {
  @Get(':id')
  find(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get(':id/broken')
  broken(): never {
    throw new InternalServerErrorException();
  }

  @Get(':id/secret')
  @UseGuards(DenyGuard)
  secret(): void {}
}

/** Request counts per `method route status_class`: the `+Inf` bucket of the histogram holds every observation. */
async function requestCounts(
  metrics: MetricsService,
): Promise<Record<string, number>> {
  const metric = await metrics.registry
    .getSingleMetric('http_server_request_duration_seconds')!
    .get();
  return Object.fromEntries(
    metric.values
      .filter((v) => v.labels.le === '+Inf')
      .map((v) => [
        `${v.labels.method} ${v.labels.route} ${v.labels.status_class}`,
        v.value,
      ]),
  );
}

describe('HttpMetricsMiddleware', () => {
  let app: INestApplication;
  let metrics: MetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => ({ metrics: { host: '127.0.0.1', port: 0 } })],
        }),
        CatchAllMiddlewareModule,
        MetricsModule,
      ],
      controllers: [ItemsController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    metrics = app.get(MetricsService);
  });

  afterEach(() => app.close());

  it('labels requests with the route template, not the real path', async () => {
    await request(app.getHttpServer()).get('/items/1').expect(200);
    await request(app.getHttpServer()).get('/items/2').expect(200);

    expect(await requestCounts(metrics)).toEqual({
      'GET /items/:id 2xx': 2,
    });
  });

  it('counts errors, guard rejections and unmatched paths', async () => {
    await request(app.getHttpServer()).get('/items/1/broken').expect(500);
    await request(app.getHttpServer()).get('/items/1/secret').expect(403);
    await request(app.getHttpServer()).get('/nowhere/42').expect(404);
    await request(app.getHttpServer()).get('/').expect(404);

    expect(await requestCounts(metrics)).toEqual({
      'GET /items/:id/broken 5xx': 1,
      'GET /items/:id/secret 4xx': 1,
      'GET unmatched 4xx': 2,
    });
  });

  it('leaves no request in flight once responses are sent', async () => {
    await request(app.getHttpServer()).get('/items/1').expect(200);

    const inFlight = await metrics.registry
      .getSingleMetric('http_server_requests_in_flight')!
      .get();
    expect(inFlight.values[0]?.value ?? 0).toBe(0);
  });
});
