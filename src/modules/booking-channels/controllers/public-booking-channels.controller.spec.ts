import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cors from 'cors';
import request from 'supertest';
import { corsOptionsDelegate } from '../../../config/public-cors.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { BookingPagesService } from '../services/booking-pages.service.js';
import { BookingWidgetsService } from '../services/booking-widgets.service.js';
import { PublicBookingChannelsController } from './public-booking-channels.controller.js';

describe('Widget initialization headers (HTTP)', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const widgets = {
    getPublished: vi.fn(),
    recordInitialization: vi.fn(),
  };
  const bookings = { getBookingSetup: vi.fn() };
  const locations = { findPublicProfile: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicBookingChannelsController],
      providers: [
        { provide: BookingPagesService, useValue: {} },
        { provide: BookingWidgetsService, useValue: widgets },
        { provide: LocationService, useValue: locations },
        { provide: BookingsFacade, useValue: bookings },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cors(corsOptionsDelegate));
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    vi.resetAllMocks();
    locations.findPublicProfile.mockResolvedValue({
      brand: { name: 'Brand', logoFile: null },
    });
    widgets.getPublished.mockResolvedValue({
      id,
      locationId: 'location',
      palette: 'INK',
    });
    bookings.getBookingSetup.mockResolvedValue({
      catalog: { services: [], bundles: [], categories: [] },
      staff: [],
      products: [],
    });
  });

  it('allows the page URL header in cross-origin preflights', async () => {
    const response = await request(app.getHttpServer())
      .options(`/public/booking-widgets/${id}`)
      .set('Origin', 'https://site.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-widget-page-url')
      .expect(200);
    expect(
      response.headers['access-control-allow-headers'].toLowerCase(),
    ).toContain('x-widget-page-url');
    expect(widgets.recordInitialization).not.toHaveBeenCalled();
  });

  it.each([undefined, 'https://site.example/booking?source=home#form'])(
    'records the supplied page URL (%s)',
    async (url) => {
      const call = request(app.getHttpServer()).get(
        `/public/booking-widgets/${id}`,
      );
      if (url) call.set('X-Widget-Page-Url', url);
      const response = await call.expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(widgets.recordInitialization).toHaveBeenCalledExactlyOnceWith(
        id,
        url ?? null,
      );
      expect(JSON.stringify(response.body)).not.toContain(
        'initializationHistory',
      );
    },
  );

  it.each([
    ['malformed', 'bad-url'],
    ['script', 'javascript:alert(1)'],
    ['credentials', 'https://user:pass@site.example/'],
    ['too long', `https://site.example/${'a'.repeat(4096)}`],
  ])(
    'rejects invalid page URLs before loading or recording (%s)',
    async (_name, url) => {
      await request(app.getHttpServer())
        .get(`/public/booking-widgets/${id}`)
        .set('X-Widget-Page-Url', url)
        .expect(400);
      expect(widgets.getPublished).not.toHaveBeenCalled();
      expect(widgets.recordInitialization).not.toHaveBeenCalled();
    },
  );

  it('does not record initialization when setup cannot be loaded', async () => {
    bookings.getBookingSetup.mockRejectedValue(new Error('Unavailable'));
    await request(app.getHttpServer())
      .get(`/public/booking-widgets/${id}`)
      .expect(500);
    expect(widgets.recordInitialization).not.toHaveBeenCalled();
  });
});
