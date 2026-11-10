import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewAggregatesService } from '../services/review-aggregates.service.js';
import { ReviewsService } from '../services/reviews.service.js';
import { PublicReviewsController } from './public-reviews.controller.js';

describe('Public reviews API (HTTP)', () => {
  let app: INestApplication;
  const locationId = '22222222-2222-4222-8222-222222222222';
  const staffId = '33333333-3333-4333-8333-333333333333';
  const reviews = { listPublished: vi.fn() };
  const aggregates = { getLocationSummary: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const review = {
    id: 'r1',
    locationId,
    rating: 5,
    text: 'Отлично',
    authorFirstName: 'Анна',
    authorLastName: 'Козлова',
    reviewedAt: new Date('2026-10-01T10:00:00Z'),
    status: 'PUBLISHED',
    hiddenReason: 'private moderator note',
    replyText: 'Спасибо!',
    repliedAt: new Date('2026-10-02T10:00:00Z'),
    repliedByName: 'Manager',
    bookingId: 'private-booking',
    clientId: 'private-client',
    staff: [
      { reviewId: 'r1', staffId, staffName: 'Мария' },
      { reviewId: 'r1', staffId: 's2', staffName: 'Алла' },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicReviewsController],
      providers: [
        { provide: ReviewsService, useValue: reviews },
        { provide: ReviewAggregatesService, useValue: aggregates },
        { provide: LocationService, useValue: locations },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    locations.getBookingSettings.mockResolvedValue({ reviewsEnabled: true });
    reviews.listPublished.mockResolvedValue({ items: [review], totalItems: 1 });
    aggregates.getLocationSummary.mockResolvedValue({
      count: 1,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
    });
  });

  it('lists published reviews without private data', async () => {
    const { body, headers } = await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .expect(200);
    const value = body.responseValue;
    expect(headers['cache-control']).toContain('public');
    expect(value.totalItems).toBe(1);
    expect(value.summary.average).toBeNull();
    expect(value.summary.distribution[0]).toEqual({ rating: 5, count: 1 });
    expect(value.items).toEqual([
      {
        id: 'r1',
        authorName: 'Анна К.',
        rating: 5,
        text: 'Отлично',
        reviewedAt: '2026-10-01T10:00:00.000Z',
        reply: { text: 'Спасибо!', repliedAt: '2026-10-02T10:00:00.000Z' },
        staff: [
          { id: 's2', name: 'Алла' },
          { id: staffId, name: 'Мария' },
        ],
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /private|Козлова|hiddenReason|repliedByName/,
    );
  });

  it('applies defaults and filters', async () => {
    await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .query({ page: 2, pageSize: 5, rating: 4, staffId })
      .expect(200);
    expect(reviews.listPublished).toHaveBeenCalledWith(locationId, {
      page: 2,
      pageSize: 5,
      staffId,
      rating: 4,
    });
    await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .expect(200);
    expect(reviews.listPublished).toHaveBeenLastCalledWith(locationId, {
      page: 1,
      pageSize: 10,
      staffId: undefined,
      rating: undefined,
    });
  });

  it('ignores isExport so the list can never be dumped at once', async () => {
    await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .query({ isExport: 'true' })
      .expect(200);
    expect(reviews.listPublished).toHaveBeenCalledWith(
      locationId,
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it.each([
    { pageSize: 51 },
    { pageSize: 0 },
    { rating: 0 },
    { rating: 6 },
    { rating: 'x' },
    { staffId: 'not-a-uuid' },
  ])('rejects invalid query %j', async (query) => {
    await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .query(query)
      .expect(400);
    expect(reviews.listPublished).not.toHaveBeenCalled();
  });

  it('rejects a malformed location id', async () => {
    await request(app.getHttpServer())
      .get('/public/locations/nope/reviews')
      .expect(400);
  });

  it('hides reviews when the location disabled them', async () => {
    locations.getBookingSettings.mockResolvedValue({ reviewsEnabled: false });
    await request(app.getHttpServer())
      .get(`/public/locations/${locationId}/reviews`)
      .expect(404);
    expect(reviews.listPublished).not.toHaveBeenCalled();
  });
});
