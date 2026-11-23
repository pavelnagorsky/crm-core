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

  it('limits each endpoint separately at 300 per minute', async () => {
    const server = app.getHttpServer();
    const statuses: number[] = [];
    for (let i = 0; i < 302; i++) {
      statuses.push((await request(server).get('/open')).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(300);
    expect(statuses.slice(300)).toEqual([429, 429]);
    await request(server).get('/open-too').expect(200);
  });

  it('never throttles routes marked with SkipRateLimit', async () => {
    for (let i = 0; i < 80; i++) {
      await request(app.getHttpServer()).get('/skipped').expect(200);
    }
  });
});
