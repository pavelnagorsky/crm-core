import { HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ReviewStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { ReviewSearchRequestDto } from '../dto/review-search-request.dto.js';
import { ReviewSearchOrderBy } from '../enums/review-search-order-by.enum.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';
import { ReviewModerationService } from './review-moderation.service.js';

const actor = { id: 'u1', name: 'Мария Иванова', role: AuditActorRole.OWNER };

const stored = {
  id: 'review',
  locationId: 'loc',
  bookingId: 'booking',
  authorFirstName: 'Анна',
  authorLastName: 'Козлова',
  rating: 4,
  text: 'Хорошо',
  status: ReviewStatus.PUBLISHED as ReviewStatus,
  hiddenAt: null as Date | null,
  hiddenReason: null as string | null,
  replyText: null as string | null,
  repliedAt: null as Date | null,
  repliedByName: null as string | null,
  staff: [],
};

function setup(existing: typeof stored | null = stored) {
  const db = {
    review: {
      findFirst: vi.fn().mockResolvedValue(existing),
      findMany: vi.fn().mockReturnValue('findMany'),
      count: vi.fn().mockReturnValue('count'),
      update: vi.fn(async ({ data }) => ({ ...stored, ...data })),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    $transaction: vi.fn().mockResolvedValue([[stored], 1]),
  };
  const aggregates = {
    invalidateLocation: vi.fn(),
    getLocationSummary: vi.fn(),
    getStaffSummary: vi.fn(),
    getClientSummary: vi.fn(),
  };
  const events = { emit: vi.fn() };
  const service = new ReviewModerationService(
    db as unknown as DatabaseService,
    aggregates as unknown as ReviewAggregatesService,
    new ReviewAuditService(events as unknown as EventEmitter2),
  );
  return { db, aggregates, events, service };
}

function searchDto(patch: Partial<ReviewSearchRequestDto> = {}) {
  return Object.assign(new ReviewSearchRequestDto(), {
    page: 2,
    pageSize: 10,
    ...patch,
  });
}

const codeOf = (error: unknown) => ({
  code: (error as AppException).errorCode,
});

describe('ReviewModerationService.search', () => {
  it('filters by location, status, rating, staff, period and text with paging', async () => {
    const { db, service } = setup();
    const result = await service.search(
      'loc',
      searchDto({
        status: ReviewStatus.HIDDEN,
        rating: 2,
        staffId: 's1',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T00:00:00.000Z',
        search: ' Анна ',
      }),
    );
    expect(result).toEqual({ items: [stored], totalItems: 1 });
    const args = db.review.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      locationId: 'loc',
      status: ReviewStatus.HIDDEN,
      rating: 2,
      staff: { some: { staffId: 's1' } },
      reviewedAt: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-10-31T00:00:00.000Z'),
      },
    });
    expect(args.where.OR).toHaveLength(4);
    expect(args.where.OR[0]).toEqual({
      authorFirstName: { contains: 'Анна', mode: 'insensitive' },
    });
    expect(args).toMatchObject({ skip: 10, take: 10 });
    expect(db.review.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('does not page exports and can order by rating', async () => {
    const { db, service } = setup();
    await service.search(
      'loc',
      searchDto({ isExport: true, orderBy: ReviewSearchOrderBy.RATING }),
    );
    const args = db.review.findMany.mock.calls[0][0];
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(args.orderBy[0]).toEqual({ rating: 'desc' });
    expect(args.orderBy).toContainEqual({ reviewedAt: 'desc' });
  });
});

describe('ReviewModerationService.getSummary', () => {
  it('combines the public summary with moderation counters', async () => {
    const { db, aggregates, service } = setup();
    const summary = { count: 3, average: 4.5, distribution: {} };
    aggregates.getLocationSummary.mockResolvedValue(summary);
    db.review.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    await expect(service.getSummary('loc', {})).resolves.toEqual({
      summary,
      hiddenCount: 2,
      unansweredCount: 5,
    });
    expect(db.review.count).toHaveBeenNthCalledWith(1, {
      where: { locationId: 'loc', status: ReviewStatus.HIDDEN },
    });
    expect(db.review.count).toHaveBeenNthCalledWith(2, {
      where: {
        locationId: 'loc',
        status: ReviewStatus.PUBLISHED,
        replyText: null,
      },
    });
  });
});

describe('ReviewModerationService.getSummary for one staff member', () => {
  it('uses the staff summary and scopes the counters to their reviews', async () => {
    const { db, aggregates, service } = setup();
    const summary = { count: 1, average: null, distribution: {} };
    aggregates.getStaffSummary.mockResolvedValue(summary);
    db.review.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await expect(service.getSummary('loc', { staffId: 's1' })).resolves.toEqual(
      {
        summary,
        hiddenCount: 0,
        unansweredCount: 1,
      },
    );
    expect(aggregates.getStaffSummary).toHaveBeenCalledWith('loc', 's1');
    expect(aggregates.getLocationSummary).not.toHaveBeenCalled();
    expect(db.review.count).toHaveBeenNthCalledWith(1, {
      where: {
        locationId: 'loc',
        staff: { some: { staffId: 's1' } },
        status: ReviewStatus.HIDDEN,
      },
    });
  });
});

describe('ReviewModerationService.getSummary for one client', () => {
  it('uses the client summary and scopes the counters to their reviews', async () => {
    const { db, aggregates, service } = setup();
    const summary = { count: 2, average: null, distribution: {} };
    aggregates.getClientSummary.mockResolvedValue(summary);
    db.review.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(
      service.getSummary('loc', { clientId: 'c1', staffId: 's1' }),
    ).resolves.toEqual({ summary, hiddenCount: 1, unansweredCount: 0 });
    expect(aggregates.getClientSummary).toHaveBeenCalledWith('loc', 'c1', 's1');
    expect(aggregates.getStaffSummary).not.toHaveBeenCalled();
    expect(db.review.count).toHaveBeenNthCalledWith(1, {
      where: {
        locationId: 'loc',
        staff: { some: { staffId: 's1' } },
        clientId: 'c1',
        status: ReviewStatus.HIDDEN,
      },
    });
  });
});

describe('ReviewModerationService.search filters', () => {
  it.each([
    [true, { not: null }],
    [false, null],
  ])('replied=%s filters by reply presence', async (replied, replyText) => {
    const { db, service } = setup();
    await service.search('loc', searchDto({ replied, clientId: 'c1' }));
    expect(db.review.findMany.mock.calls[0][0].where).toMatchObject({
      clientId: 'c1',
      replyText,
    });
  });

  it('does not filter by reply when replied is absent', async () => {
    const { db, service } = setup();
    await service.search('loc', searchDto());
    expect(db.review.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'replyText',
    );
  });
});

describe('ReviewModerationService.findById', () => {
  it('scopes the lookup to the location and throws REVIEW_NOT_FOUND', async () => {
    const { db, service } = setup(null);
    const error = await service.findById('loc', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(codeOf(error).code).toBe(ErrorCode.REVIEW_NOT_FOUND.code);
    expect(db.review.findFirst).toHaveBeenCalledWith({
      where: { id: 'x', locationId: 'loc' },
      include: { staff: true },
    });
  });
});

describe('ReviewModerationService.setVisibility', () => {
  it.each([undefined, '', '   '])(
    'hides without a reason (%j)',
    async (reason) => {
      const { db, service } = setup();
      await service.setVisibility(
        'loc',
        'review',
        { status: ReviewStatus.HIDDEN, reason },
        actor,
      );
      const data = db.review.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: ReviewStatus.HIDDEN,
        hiddenReason: null,
      });
      expect(data.hiddenAt).toBeInstanceOf(Date);
    },
  );

  it('hides with a trimmed reason, refreshes the cache and audits', async () => {
    const { db, aggregates, events, service } = setup();
    await service.setVisibility(
      'loc',
      'review',
      { status: ReviewStatus.HIDDEN, reason: ' спам ' },
      actor,
    );
    const data = db.review.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: ReviewStatus.HIDDEN,
      hiddenReason: 'спам',
    });
    expect(data.hiddenAt).toBeInstanceOf(Date);
    expect(aggregates.invalidateLocation).toHaveBeenCalledWith('loc');
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        eventType: AuditEvent.REVIEW_VISIBILITY_CHANGED,
        locationId: 'loc',
        entityId: 'review',
      }),
    );
  });

  it('publishing clears the hidden state and ignores a reason', async () => {
    const hidden = {
      ...stored,
      status: ReviewStatus.HIDDEN,
      hiddenAt: new Date(),
      hiddenReason: 'спам',
    };
    const { db, service } = setup(hidden);
    await service.setVisibility(
      'loc',
      'review',
      { status: ReviewStatus.PUBLISHED, reason: 'ignored' },
      actor,
    );
    expect(db.review.update.mock.calls[0][0].data).toEqual({
      status: ReviewStatus.PUBLISHED,
      hiddenAt: null,
      hiddenReason: null,
    });
  });

  it('keeps the original hidden date when only the reason changes', async () => {
    const hiddenAt = new Date('2026-10-01T00:00:00Z');
    const { db, service } = setup({
      ...stored,
      status: ReviewStatus.HIDDEN,
      hiddenAt,
      hiddenReason: 'старая причина',
    });
    await service.setVisibility(
      'loc',
      'review',
      { status: ReviewStatus.HIDDEN, reason: 'новая причина' },
      actor,
    );
    expect(db.review.update.mock.calls[0][0].data.hiddenAt).toBe(hiddenAt);
  });

  it('is a no-op when nothing changes', async () => {
    const { db, aggregates, events, service } = setup();
    await service.setVisibility(
      'loc',
      'review',
      { status: ReviewStatus.PUBLISHED },
      actor,
    );
    expect(db.review.update).not.toHaveBeenCalled();
    expect(aggregates.invalidateLocation).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('ReviewModerationService replies', () => {
  it('saves a reply stamped with the actor name', async () => {
    const { db, events, service } = setup();
    const review = await service.saveReply('loc', 'review', 'Спасибо!', actor);
    expect(db.review.update.mock.calls[0][0].data).toMatchObject({
      replyText: 'Спасибо!',
      repliedByName: 'Мария Иванова',
    });
    expect(review.repliedAt).toBeInstanceOf(Date);
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({ eventType: AuditEvent.REVIEW_REPLIED }),
    );
  });

  it('does nothing when the reply text is unchanged', async () => {
    const { db, events, service } = setup({ ...stored, replyText: 'Спасибо!' });
    await service.saveReply('loc', 'review', 'Спасибо!', actor);
    expect(db.review.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('deletes a reply', async () => {
    const { db, events, service } = setup({ ...stored, replyText: 'Спасибо!' });
    await service.deleteReply('loc', 'review', actor);
    expect(db.review.update.mock.calls[0][0].data).toEqual({
      replyText: null,
      repliedAt: null,
      repliedByName: null,
    });
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({ eventType: AuditEvent.REVIEW_REPLY_DELETED }),
    );
  });

  it('rejects deleting a missing reply with REVIEW_REPLY_NOT_FOUND', async () => {
    const { db, service } = setup();
    const error = await service
      .deleteReply('loc', 'review', actor)
      .catch((e: unknown) => e);
    expect((error as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(codeOf(error).code).toBe(ErrorCode.REVIEW_REPLY_NOT_FOUND.code);
    expect(db.review.update).not.toHaveBeenCalled();
  });

  it('maps a concurrent delete to REVIEW_NOT_FOUND', async () => {
    const { db, service } = setup();
    db.review.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', {
        code: PrismaErrorCode.RECORD_NOT_FOUND,
        clientVersion: 'test',
      }),
    );
    const error = await service
      .saveReply('loc', 'review', 'Спасибо!', actor)
      .catch((e: unknown) => e);
    expect(codeOf(error).code).toBe(ErrorCode.REVIEW_NOT_FOUND.code);
  });
});

describe('ReviewModerationService.delete', () => {
  it('hard deletes, refreshes the cache and audits the last snapshot', async () => {
    const { db, aggregates, events, service } = setup();
    await service.delete('loc', 'review', actor);
    expect(db.review.delete).toHaveBeenCalledWith({ where: { id: 'review' } });
    expect(aggregates.invalidateLocation).toHaveBeenCalledWith('loc');
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        eventType: AuditEvent.REVIEW_DELETED,
        entityId: 'review',
        locationId: 'loc',
      }),
    );
  });

  it('does not touch another location review', async () => {
    const { db, events, service } = setup(null);
    await expect(service.delete('loc', 'review', actor)).rejects.toBeInstanceOf(
      AppException,
    );
    expect(db.review.delete).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
