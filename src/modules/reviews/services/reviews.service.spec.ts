import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { ReviewSearchOrderBy } from '../enums/review-search-order-by.enum.js';
import { HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { ReviewableBooking } from '../interfaces/reviewable-booking.interface.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';
import { ReviewsService } from './reviews.service.js';

const booking: ReviewableBooking = {
  id: 'booking',
  locationId: 'loc',
  clientId: 'client',
  status: BookingStatus.COMPLETED,
  deletedAt: null,
  clientFirstName: 'Анна',
  clientLastName: 'Козлова',
  items: [
    { staffId: 's1', staffName: 'Мастер 1' },
    { staffId: 's2', staffName: 'Мастер 2' },
    { staffId: 's1', staffName: 'Мастер 1' },
  ],
};

const stored = {
  id: 'review',
  locationId: 'loc',
  bookingId: 'booking',
  rating: 4,
  text: 'Хорошо',
  status: 'PUBLISHED',
  hiddenReason: null,
  replyText: null,
  staff: [],
};

function setup(existing: unknown = null) {
  const db = {
    review: {
      findUnique: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }) => ({ ...stored, ...data, staff: [] })),
      update: vi.fn(async ({ data }) => ({ ...stored, ...data })),
    },
  };
  const aggregates = { invalidateLocation: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new ReviewsService(
    db as unknown as DatabaseService,
    aggregates as unknown as ReviewAggregatesService,
    new ReviewAuditService(events as unknown as EventEmitter2),
  );
  return { db, aggregates, events, service };
}

describe('ReviewsService.submitForBooking', () => {
  it.each([
    [{ ...booking, status: BookingStatus.CONFIRMED }, true],
    [{ ...booking, deletedAt: new Date() }, true],
    [booking, false],
  ])(
    'rejects ineligible bookings without touching data',
    async (b, enabled) => {
      const { db, service } = setup();
      const error = await service
        .submitForBooking(b, { rating: 5, text: 'x' }, enabled)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((error as AppException).errorCode).toBe('REVIEW_NOT_ALLOWED');
      expect(db.review.create).not.toHaveBeenCalled();
    },
  );

  it('creates a review with author snapshot and unique visit masters', async () => {
    const { db, aggregates, events, service } = setup();
    const result = await service.submitForBooking(
      booking,
      { rating: 5, text: 'Супер' },
      true,
    );
    expect(result.created).toBe(true);
    const data = db.review.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      locationId: 'loc',
      bookingId: 'booking',
      clientId: 'client',
      rating: 5,
      text: 'Супер',
      authorFirstName: 'Анна',
      authorLastName: 'Козлова',
    });
    expect(data.staff.create).toEqual([
      { staffId: 's1', staffName: 'Мастер 1' },
      { staffId: 's2', staffName: 'Мастер 2' },
    ]);
    expect(aggregates.invalidateLocation).toHaveBeenCalledWith('loc');
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        eventType: AuditEvent.REVIEW_CREATED,
        actor: expect.objectContaining({ role: 'CLIENT' }),
      }),
    );
  });

  it('edits only rating and text of an existing review', async () => {
    const { db, aggregates, events, service } = setup(stored);
    const result = await service.submitForBooking(
      booking,
      { rating: 2, text: 'Хорошо' },
      true,
    );
    expect(result.created).toBe(false);
    expect(db.review.update.mock.calls[0][0].data).toEqual({
      rating: 2,
      text: 'Хорошо',
    });
    expect(db.review.create).not.toHaveBeenCalled();
    expect(aggregates.invalidateLocation).toHaveBeenCalledOnce();
    expect(events.emit.mock.calls[0][1]).toMatchObject({
      eventType: AuditEvent.REVIEW_UPDATED,
      payload: { changes: [{ field: 'rating', from: '4', to: '2' }] },
    });
  });

  it('does nothing when the edit changes nothing', async () => {
    const { db, aggregates, events, service } = setup(stored);
    await service.submitForBooking(
      booking,
      { rating: 4, text: 'Хорошо' },
      true,
    );
    expect(db.review.update).not.toHaveBeenCalled();
    expect(aggregates.invalidateLocation).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('applies a concurrent duplicate create as an edit', async () => {
    const { db, events, service } = setup();
    db.review.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored);
    db.review.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
        clientVersion: 'test',
      }),
    );
    const result = await service.submitForBooking(
      booking,
      { rating: 1, text: 'Плохо' },
      true,
    );
    expect(result.created).toBe(false);
    expect(db.review.update).toHaveBeenCalledOnce();
    expect(events.emit.mock.calls[0][1].eventType).toBe(
      AuditEvent.REVIEW_UPDATED,
    );
  });
});

describe('ReviewsService.listPublished', () => {
  it('queries published reviews newest first with filters and offset', async () => {
    const db = {
      review: {
        findMany: vi.fn().mockResolvedValue([stored]),
        count: vi.fn().mockResolvedValue(11),
      },
    };
    const service = new ReviewsService(
      db as unknown as DatabaseService,
      {} as ReviewAggregatesService,
      {} as ReviewAuditService,
    );
    const page = await service.listPublished('loc', {
      page: 3,
      pageSize: 5,
      staffId: 's1',
      rating: 4,
    });
    expect(page).toEqual({ items: [stored], totalItems: 11 });
    const where = {
      locationId: 'loc',
      status: 'PUBLISHED',
      rating: 4,
      staff: { some: { staffId: 's1' } },
    };
    expect(db.review.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 5,
      include: { staff: true },
    });
    expect(db.review.count).toHaveBeenCalledWith({ where });

    await service.listPublished('loc', {
      page: 1,
      pageSize: 5,
      orderBy: ReviewSearchOrderBy.RATING,
      orderDirection: OrderDirection.ASC,
    });
    expect(db.review.findMany.mock.calls[1][0].orderBy).toEqual([
      { rating: 'asc' },
      { reviewedAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('omits absent filters', async () => {
    const db = {
      review: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new ReviewsService(
      db as unknown as DatabaseService,
      {} as ReviewAggregatesService,
      {} as ReviewAuditService,
    );
    await service.listPublished('loc', { page: 1, pageSize: 10 });
    expect(db.review.count).toHaveBeenCalledWith({
      where: { locationId: 'loc', status: 'PUBLISHED' },
    });
  });
});

describe('ReviewsService.findReviewedBookingIds', () => {
  it('returns the booking ids that already have a review', async () => {
    const { db, service } = setup();
    db.review.findMany.mockResolvedValue([
      { bookingId: 'b1' },
      { bookingId: null },
    ]);
    await expect(service.findReviewedBookingIds(['b1', 'b2'])).resolves.toEqual(
      new Set(['b1']),
    );
    expect(db.review.findMany).toHaveBeenCalledWith({
      where: { bookingId: { in: ['b1', 'b2'] } },
      select: { bookingId: true },
    });
  });

  it('skips the query for an empty list', async () => {
    const { db, service } = setup();
    await expect(service.findReviewedBookingIds([])).resolves.toEqual(
      new Set(),
    );
    expect(db.review.findMany).not.toHaveBeenCalled();
  });
});
