import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cors from 'cors';
import request from 'supertest';
import { corsOptionsDelegate } from '../../../config/public-cors.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
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
  const reviews = { getLocationOverview: vi.fn(), getStaffSummaries: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicBookingChannelsController],
      providers: [
        { provide: BookingPagesService, useValue: {} },
        { provide: BookingWidgetsService, useValue: widgets },
        { provide: LocationService, useValue: locations },
        { provide: BookingsFacade, useValue: bookings },
        { provide: ReviewsFacade, useValue: reviews },
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
      id: 'location',
      reviewsEnabled: true,
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
    reviews.getLocationOverview.mockResolvedValue({
      summary: { count: 0, average: null, distribution: {} },
      latest: [],
    });
    reviews.getStaffSummaries.mockResolvedValue(new Map());
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

  describe('reviews in the widget response', () => {
    const staffMember = {
      id: 'staff-1',
      name: 'Мария',
      roleTitle: null,
      description: null,
      avatarFile: null,
      staffServices: [],
    };
    const published = {
      id: 'r1',
      authorFirstName: 'Анна',
      authorLastName: 'Козлова',
      rating: 5,
      text: 'Отлично',
      reviewedAt: new Date('2026-10-01T10:00:00Z'),
      replyText: null,
      repliedAt: null,
      staff: [],
    };

    beforeEach(() => {
      bookings.getBookingSetup.mockResolvedValue({
        catalog: { services: [], bundles: [], categories: [] },
        staff: [staffMember],
        products: [],
      });
    });

    it('is null without published reviews and staff have no summary', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/public/booking-widgets/${id}`)
        .expect(200);
      expect(body.responseValue.reviews).toBeNull();
      expect(body.responseValue.setup.staff[0].reviewSummary).toBeNull();
    });

    it('embeds the overview and per-staff summaries', async () => {
      reviews.getLocationOverview.mockResolvedValue({
        summary: {
          count: 1,
          average: null,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
        },
        latest: [published],
      });
      reviews.getStaffSummaries.mockResolvedValue(
        new Map([['staff-1', { count: 1, average: null }]]),
      );
      const { body } = await request(app.getHttpServer())
        .get(`/public/booking-widgets/${id}`)
        .expect(200);
      expect(body.responseValue.reviews.summary.count).toBe(1);
      expect(body.responseValue.reviews.latest[0].authorName).toBe('Анна К.');
      expect(body.responseValue.setup.staff[0].reviewSummary).toEqual({
        count: 1,
        average: null,
      });
      expect(reviews.getStaffSummaries).toHaveBeenCalledWith('location', [
        'staff-1',
      ]);
    });

    it('does not load or expose reviews when the location disabled them', async () => {
      locations.findPublicProfile.mockResolvedValue({
        id: 'location',
        reviewsEnabled: false,
        brand: { name: 'Brand', logoFile: null },
      });
      const { body } = await request(app.getHttpServer())
        .get(`/public/booking-widgets/${id}`)
        .expect(200);
      expect(body.responseValue.reviews).toBeNull();
      expect(body.responseValue.setup.staff[0].reviewSummary).toBeNull();
      expect(reviews.getLocationOverview).not.toHaveBeenCalled();
      expect(reviews.getStaffSummaries).not.toHaveBeenCalled();
    });
  });
});
