import { Injectable } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { ReviewListFilter } from '../interfaces/review-list-filter.interface.js';
import { ReviewPage } from '../interfaces/review-page.interface.js';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';
import { ReviewableBooking } from '../interfaces/reviewable-booking.interface.js';
import { SubmitReviewInput } from '../interfaces/submit-review-input.interface.js';
import { SubmitReviewResult } from '../interfaces/submit-review-result.interface.js';
import { reviewOrderBy } from '../rules/review-order.rules.js';
import { assertBookingReviewable } from '../rules/review-eligibility.rules.js';
import {
  authorSnapshot,
  clientAuditActor,
} from '../rules/review-author.rules.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aggregates: ReviewAggregatesService,
    private readonly audit: ReviewAuditService,
  ) {}

  findByBookingId(bookingId: string): Promise<ReviewWithStaff | null> {
    return this.db.review.findUnique({
      where: { bookingId },
      include: { staff: true },
    });
  }

  async findReviewedBookingIds(
    bookingIds: readonly string[],
  ): Promise<Set<string>> {
    if (bookingIds.length === 0) return new Set();
    const reviews = await this.db.review.findMany({
      where: { bookingId: { in: [...bookingIds] } },
      select: { bookingId: true },
    });
    return new Set(reviews.flatMap((review) => review.bookingId ?? []));
  }

  /** Published reviews only, newest first unless another order is asked. */
  async listPublished(
    locationId: string,
    filter: ReviewListFilter,
  ): Promise<ReviewPage> {
    const where: Prisma.ReviewWhereInput = {
      locationId,
      status: ReviewStatus.PUBLISHED,
      ...(filter.rating !== undefined && { rating: filter.rating }),
      ...(filter.staffId && { staff: { some: { staffId: filter.staffId } } }),
    };
    const [items, totalItems] = await Promise.all([
      this.db.review.findMany({
        where,
        orderBy: reviewOrderBy(filter.orderBy, filter.orderDirection),
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: { staff: true },
      }),
      this.db.review.count({ where }),
    ]);
    return { items, totalItems };
  }

  /**
   * One review per visit: the first call creates it and snapshots the author and the masters
   * of the visit, later calls only edit rating and text.
   */
  async submitForBooking(
    booking: ReviewableBooking,
    input: SubmitReviewInput,
    reviewsEnabled: boolean,
  ): Promise<SubmitReviewResult> {
    assertBookingReviewable(booking, reviewsEnabled);

    const existing = await this.findByBookingId(booking.id);
    const result = existing
      ? await this.edit(existing, input)
      : await this.createOrEdit(booking, input);

    if (result.changed) {
      await this.aggregates.invalidateLocation(booking.locationId);
      this.audit.emit({
        actor: clientAuditActor(booking),
        eventType: result.before
          ? AuditEvent.REVIEW_UPDATED
          : AuditEvent.REVIEW_CREATED,
        actionType: result.before
          ? AuditActionType.MODIFY
          : AuditActionType.CREATE,
        before: result.before,
        after: result.review,
      });
    }
    return { review: result.review, created: result.before == null };
  }

  private async createOrEdit(
    booking: ReviewableBooking,
    input: SubmitReviewInput,
  ) {
    try {
      const review = await this.db.review.create({
        data: {
          locationId: booking.locationId,
          bookingId: booking.id,
          clientId: booking.clientId,
          rating: input.rating,
          text: input.text,
          authorFirstName: authorSnapshot(booking.clientFirstName),
          authorLastName: authorSnapshot(booking.clientLastName),
          reviewedAt: new Date(),
          staff: {
            create: [
              ...new Map(
                booking.items.map((item) => [item.staffId, item.staffName]),
              ),
            ].map(([staffId, staffName]) => ({ staffId, staffName })),
          },
        },
        include: { staff: true },
      });
      return { review, before: null, changed: true };
    } catch (error) {
      if (
        (error as { code?: string })?.code !==
        PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      )
        throw error;
      // A concurrent request created the review first: apply this one as an edit.
      const existing = await this.findByBookingId(booking.id);
      if (!existing) throw error;
      return this.edit(existing, input);
    }
  }

  private async edit(before: ReviewWithStaff, input: SubmitReviewInput) {
    if (before.rating === input.rating && before.text === input.text)
      return { review: before, before, changed: false };
    const review = await this.db.review.update({
      where: { id: before.id },
      data: { rating: input.rating, text: input.text },
      include: { staff: true },
    });
    return { review, before, changed: true };
  }
}
