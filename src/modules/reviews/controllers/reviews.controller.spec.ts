import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ReviewStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import {
  PermissionGuard,
  PERMISSIONS_KEY,
} from '../../auth/guards/permission.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { ReviewModerationService } from '../services/review-moderation.service.js';
import { ReviewsController } from './reviews.controller.js';

describe('Reviews admin API (HTTP)', () => {
  let app: INestApplication;
  const locationId = '22222222-2222-4222-8222-222222222222';
  const reviewId = '44444444-4444-4444-8444-444444444444';
  const base = `/locations/${locationId}/reviews`;
  const moderation = {
    search: vi.fn(),
    getSummary: vi.fn(),
    findById: vi.fn(),
    setVisibility: vi.fn(),
    saveReply: vi.fn(),
    deleteReply: vi.fn(),
    delete: vi.fn(),
  };
  const review = {
    id: reviewId,
    locationId,
    bookingId: 'b1',
    clientId: 'c1',
    authorFirstName: 'Анна',
    authorLastName: 'Козлова',
    rating: 2,
    text: 'Долго ждали',
    reviewedAt: new Date('2026-10-01T10:00:00Z'),
    status: ReviewStatus.PUBLISHED,
    hiddenAt: null,
    hiddenReason: null,
    replyText: null,
    repliedAt: null,
    repliedByName: null,
    source: 'YCLIENTS',
    importKey: 'id:42',
    importBatchId: 'batch-1',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    staff: [{ reviewId, staffId: 's1', staffName: 'Мария' }],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewModerationService, useValue: moderation }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: 'user-1',
            role: UserRole.USER,
            firstName: 'Мария',
            lastName: 'Иванова',
            brandMemberships: [],
            locationMemberships: [],
          };
          return true;
        },
      })
      .overrideGuard(TokenEpochGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    moderation.search.mockResolvedValue({ items: [review], totalItems: 1 });
    moderation.findById.mockResolvedValue(review);
    moderation.setVisibility.mockResolvedValue(review);
    moderation.saveReply.mockResolvedValue(review);
    moderation.getSummary.mockResolvedValue({
      summary: {
        count: 1,
        average: null,
        distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 },
      },
      hiddenCount: 0,
      unansweredCount: 1,
    });
  });

  it('searches with parsed filters and returns the full review', async () => {
    const { body } = await request(app.getHttpServer())
      .get(base)
      .query({ rating: '2', status: 'PUBLISHED', page: '2', pageSize: '5' })
      .expect(200);
    const dto = moderation.search.mock.calls[0][1];
    expect(moderation.search.mock.calls[0][0]).toBe(locationId);
    expect(dto).toMatchObject({ rating: 2, status: 'PUBLISHED', page: 2 });
    expect(body.responseValue.totalItems).toBe(1);
    expect(body.responseValue.items[0]).toMatchObject({
      id: reviewId,
      authorFirstName: 'Анна',
      authorLastName: 'Козлова',
      clientId: 'c1',
      source: 'YCLIENTS',
      reply: null,
      staff: [{ id: 's1', name: 'Мария' }],
    });
    expect(body.responseValue.items[0]).not.toHaveProperty('importKey');
    expect(body.responseValue.items[0]).not.toHaveProperty('importBatchId');
  });

  it.each([
    ['rating', '9'],
    ['rating', '0'],
    ['status', 'DELETED'],
    ['staffId', 'not-a-uuid'],
    ['from', 'yesterday'],
    ['orderBy', 'text'],
    ['clientId', 'not-a-uuid'],
    ['replied', 'maybe'],
  ])('rejects invalid search filter %s=%s', async (key, value) => {
    await request(app.getHttpServer())
      .get(base)
      .query({ [key]: value })
      .expect(400);
    expect(moderation.search).not.toHaveBeenCalled();
  });

  it('serves the summary before the :reviewId route', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`${base}/summary`)
      .expect(200);
    expect(body.responseValue).toMatchObject({
      hiddenCount: 0,
      unansweredCount: 1,
    });
    expect(moderation.findById).not.toHaveBeenCalled();
  });

  it('passes staffId and clientId to the summary and validates them', async () => {
    await request(app.getHttpServer())
      .get(`${base}/summary`)
      .query({
        staffId: '33333333-3333-4333-8333-333333333333',
        clientId: '44444444-4444-4444-8444-444444444444',
      })
      .expect(200);
    expect(moderation.getSummary).toHaveBeenLastCalledWith(
      locationId,
      expect.objectContaining({
        staffId: '33333333-3333-4333-8333-333333333333',
        clientId: '44444444-4444-4444-8444-444444444444',
      }),
    );
    await request(app.getHttpServer())
      .get(`${base}/summary`)
      .query({ staffId: 'nope' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${base}/summary`)
      .query({ clientId: 'nope' })
      .expect(400);
  });

  it('parses the replied and clientId filters', async () => {
    await request(app.getHttpServer())
      .get(base)
      .query({
        replied: 'false',
        clientId: '33333333-3333-4333-8333-333333333333',
      })
      .expect(200);
    expect(moderation.search.mock.calls[0][1]).toMatchObject({
      replied: false,
      clientId: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('gets a review and rejects a malformed id', async () => {
    await request(app.getHttpServer()).get(`${base}/${reviewId}`).expect(200);
    expect(moderation.findById).toHaveBeenCalledWith(locationId, reviewId);
    await request(app.getHttpServer()).get(`${base}/nope`).expect(400);
  });

  it('hides a review passing the actor from the token', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${reviewId}/visibility`)
      .send({ status: 'HIDDEN', reason: '<b>спам</b>' })
      .expect(200);
    const [loc, id, dto, actor] = moderation.setVisibility.mock.calls[0];
    expect([loc, id]).toEqual([locationId, reviewId]);
    expect(dto).toMatchObject({ status: 'HIDDEN', reason: 'спам' });
    expect(actor).toMatchObject({ id: 'user-1', name: 'Мария Иванова' });
  });

  it('rejects an unknown visibility status', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${reviewId}/visibility`)
      .send({ status: 'DELETED' })
      .expect(400);
    expect(moderation.setVisibility).not.toHaveBeenCalled();
  });

  it('saves a sanitized reply', async () => {
    await request(app.getHttpServer())
      .put(`${base}/${reviewId}/reply`)
      .send({ text: ' <i>Спасибо</i> за отзыв ' })
      .expect(200);
    expect(moderation.saveReply.mock.calls[0].slice(0, 3)).toEqual([
      locationId,
      reviewId,
      'Спасибо за отзыв',
    ]);
  });

  it.each(['', '   ', '<br>'])('rejects an empty reply %j', async (text) => {
    await request(app.getHttpServer())
      .put(`${base}/${reviewId}/reply`)
      .send({ text })
      .expect(400);
    expect(moderation.saveReply).not.toHaveBeenCalled();
  });

  it('deletes a reply and a review with 204 and no body', async () => {
    const reply = await request(app.getHttpServer())
      .delete(`${base}/${reviewId}/reply`)
      .expect(204);
    const removed = await request(app.getHttpServer())
      .delete(`${base}/${reviewId}`)
      .expect(204);
    expect(reply.body).toEqual({});
    expect(removed.body).toEqual({});
    expect(moderation.deleteReply).toHaveBeenCalledTimes(1);
    expect(moderation.delete).toHaveBeenCalledTimes(1);
    expect(moderation.delete.mock.calls[0].slice(0, 2)).toEqual([
      locationId,
      reviewId,
    ]);
  });
});

describe('Reviews admin API permissions', () => {
  const reflector = new Reflector();
  const proto = ReviewsController.prototype;
  const required = (handler: keyof ReviewsController) =>
    reflector.get(PERMISSIONS_KEY, proto[handler]);

  it.each(['search', 'getSummary', 'findById'] as const)(
    '%s needs review:read',
    (handler) => {
      expect(required(handler)).toEqual([Read(Claim.REVIEW)]);
    },
  );

  it.each(['setVisibility', 'saveReply', 'deleteReply', 'delete'] as const)(
    '%s needs review:write',
    (handler) => {
      expect(required(handler)).toEqual([Write(Claim.REVIEW)]);
    },
  );
});
