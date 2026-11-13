import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { throttlerConfig } from '../../config/throttler.config.js';
import { SkipRateLimit } from '../decorators/skip-rate-limit.decorator.js';
import { StrictRateLimit } from '../decorators/strict-rate-limit.decorator.js';
import { GlobalExceptionFilter } from '../filters/exception.filter.js';
import { AppThrottlerGuard } from './app-throttler.guard.js';

@Controller()
class ProbeController {
  @StrictRateLimit()
  @Get('strict')
  strict(): string {
    return 'ok';
  }

  @Get('open')
  open(): string {
    return 'ok';
  }

  @Get('open-too')
  openToo(): string {
    return 'ok';
  }

  @SkipRateLimit()
  @Get('skipped')
  skipped(): string {
    return 'ok';
  }
}

describe('AppThrottlerGuard (HTTP)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerConfig)],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(async () => app?.close());

  it('rejects strict routes after 10 requests with TOO_MANY_REQUESTS', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).get('/strict').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/strict').expect(429);
    expect(JSON.stringify(res.body)).toContain('TOO_MANY_REQUESTS');
    await request(app.getHttpServer()).get('/open').expect(200);
  });

  it('caps bursts per IP across all routes', async () => {
    const server = app.getHttpServer();
    const responses = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        request(server).get(i % 2 ? '/open' : '/open-too'),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(50);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
  });

  it('never throttles routes marked with SkipRateLimit', async () => {
    for (let i = 0; i < 80; i++) {
      await request(app.getHttpServer()).get('/skipped').expect(200);
    }
  });
});
