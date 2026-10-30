import {
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { BookingChannelStatsService } from '../services/booking-channel-stats.service.js';
import { BookingChannelEventsRateGuard } from '../guards/booking-channel-events-rate.guard.js';
import { SaveBookingPageDto } from '../dto/save-booking-page.dto.js';
import { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import { PublicBookingChannelEventsController } from './public-booking-channel-events.controller.js';

describe('Public booking channel events (HTTP)', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const stats = { recordPage: vi.fn(), recordWidget: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicBookingChannelEventsController],
      providers: [
        BookingChannelEventsRateGuard,
        { provide: BookingChannelStatsService, useValue: stats },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => vi.clearAllMocks());

  it.each(['pages', 'widgets'])(
    'accepts a public %s event without accepting client counters',
    async (kind) => {
      const { body, headers } = await request(app.getHttpServer())
        .post(`/public/booking-${kind}/${id}/events`)
        .set('Origin', 'https://example.com')
        .send({ event: 'VIEW', views: 10000, bookings: 10000 })
        .expect(200);
      expect(body).toMatchObject({ isSuccess: true, responseValue: null });
      expect(headers['cache-control']).toBe('no-store');
      if (kind === 'pages')
        expect(stats.recordPage).toHaveBeenCalledExactlyOnceWith(id, 'VIEW');
      else
        expect(stats.recordWidget).toHaveBeenCalledExactlyOnceWith(
          id,
          'VIEW',
          'https://example.com',
        );
    },
  );

  it.each(['pages', 'widgets'])(
    'validates %s IDs and event types before recording',
    async (kind) => {
      await request(app.getHttpServer())
        .post(`/public/booking-${kind}/invalid/events`)
        .send({ event: 'VIEW' })
        .expect(400);
      for (const payload of [{}, { event: 'BOOKING' }, { event: ['VIEW'] }]) {
        await request(app.getHttpServer())
          .post(`/public/booking-${kind}/${id}/events`)
          .send(payload)
          .expect(400);
      }
      expect(stats.recordPage).not.toHaveBeenCalled();
      expect(stats.recordWidget).not.toHaveBeenCalled();
    },
  );

  it('passes the referer origin for widgets and propagates domain rejection', async () => {
    stats.recordWidget.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer())
      .post(`/public/booking-widgets/${id}/events`)
      .set('Referer', 'https://forbidden.example/path?query=value')
      .send({ event: 'FORM_OPEN' })
      .expect(403);
    expect(stats.recordWidget).toHaveBeenCalledExactlyOnceWith(
      id,
      'FORM_OPEN',
      'https://forbidden.example',
    );
  });

  it('publishes inherited optional analytics fields in both OpenAPI schemas', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
      {
        extraModels: [SaveBookingPageDto, SaveBookingWidgetDto],
      },
    );
    for (const name of ['SaveBookingPageDto', 'SaveBookingWidgetDto']) {
      const schema = document.components?.schemas?.[name];
      expect(schema).toMatchObject({
        properties: {
          gtmId: { type: 'string', nullable: true, maxLength: 32 },
          yandexMetrikaId: { type: 'string', nullable: true, maxLength: 15 },
        },
      });
      const required = schema && 'required' in schema ? schema.required : [];
      expect(required).not.toContain('gtmId');
      expect(required).not.toContain('yandexMetrikaId');
    }
  });
});
