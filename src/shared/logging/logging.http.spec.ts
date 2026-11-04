import {
  ConsoleLogger,
  INestApplication,
  Logger as NestLogger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Writable } from 'node:stream';
import { Logger, LoggerModule } from 'nestjs-pino';
import { Options } from 'pino-http';
import request from 'supertest';
import { loggerConfig } from '../../config/logger.config.js';
import { GlobalExceptionFilter } from '../filters/exception.filter.js';
import { LoggingTestController } from './testing/controllers/logging-test.controller.js';

describe('HTTP logging', () => {
  let app: INestApplication;
  let lines: string[];

  beforeAll(async () => {
    lines = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const config = new ConfigService({
      logging: { level: 'info', directory: 'unused' },
    });
    const options = loggerConfig(config).pinoHttp as Options;
    const module = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [options, destination] })],
      controllers: [LoggingTestController],
    }).compile();
    app = module.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    lines.length = 0;
  });
  afterAll(async () => {
    await app.close();
    NestLogger.overrideLogger(new ConsoleLogger());
  });

  it('keeps parallel requests separate and excludes headers, bodies and query credentials', async () => {
    await Promise.all(
      ['request-a', 'request-b'].map((id) =>
        request(app.getHttpServer())
          .get('/logging-test/ok?token=query-secret')
          .set('X-Request-Id', id)
          .set('Authorization', 'Bearer header-secret')
          .set('Cookie', 'refreshToken=cookie-secret')
          .send({ password: 'body-secret' })
          .expect(200)
          .expect('X-Request-Id', id),
      ),
    );
    const logs = lines.map((line) => JSON.parse(line));
    for (const requestId of ['request-a', 'request-b']) {
      const related = logs.filter((log) => log.requestId === requestId);
      expect(related).toHaveLength(2);
      expect(related).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'operation completed',
            context: 'LoggingTestController',
          }),
          expect.objectContaining({
            msg: expect.stringContaining('status=200'),
            responseTime: expect.any(Number),
          }),
        ]),
      );
    }
    expect(lines.join('')).not.toContain('secret');
  });

  it.each([undefined, 'invalid request id', 'a'.repeat(65)])(
    'generates a UUID for absent or invalid ID: %s',
    async (id) => {
      const http = request(app.getHttpServer()).get('/logging-test/ok');
      if (id) http.set('X-Request-Id', id);
      const response = await http.expect(200);
      const generated = response.headers['x-request-id'];
      expect(generated).toMatch(/^[0-9a-f-]{36}$/);
      expect(lines.map((line) => JSON.parse(line))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            requestId: generated,
            msg: 'operation completed',
          }),
        ]),
      );
    },
  );

  it('links OAuth warnings and HTTP rejections to the same request', async () => {
    await request(app.getHttpServer())
      .get('/logging-test/rejected')
      .set('X-Request-Id', 'oauth-rejected')
      .expect(401);
    const logs = lines.map((line) => JSON.parse(line));
    expect(logs).toHaveLength(3);
    expect(
      logs.every(
        (log) => log.requestId === 'oauth-rejected' && log.level === 40,
      ),
    ).toBe(true);
    expect(
      logs.some((log) => log.msg.includes('EMAIL_MISSING_OR_INVALID')),
    ).toBe(true);
  });

  it('preserves the unexpected error stack and request ID', async () => {
    await request(app.getHttpServer())
      .get('/logging-test/failed')
      .set('X-Request-Id', 'failed-request')
      .expect(500);
    const logs = lines.map((line) => JSON.parse(line));
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 50,
          requestId: 'failed-request',
          err: expect.objectContaining({
            stack: expect.stringContaining('storage unavailable'),
          }),
        }),
        expect.objectContaining({
          level: 50,
          requestId: 'failed-request',
          msg: expect.stringContaining('status=500'),
          responseTime: expect.any(Number),
        }),
      ]),
    );
  });
});
