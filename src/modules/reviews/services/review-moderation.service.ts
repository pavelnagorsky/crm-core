import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { BookingVisitsService } from '../../bookings/visits/services/booking-visits.service.js';
import { ReviewSearchRequestDto } from '../dto/review-search-request.dto.js';
import { ReviewSummaryRequestDto } from '../dto/review-summary-request.dto.js';
import { UpdateReviewVisibilityDto } from '../dto/update-review-visibility.dto.js';
import { ReviewAdminSummary } from '../interfaces/review-admin-summary.interface.js';
import { ReviewPage } from '../interfaces/review-page.interface.js';
import { ReviewSummary } from '../interfaces/review-summary.interface.js';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';
import { ReviewWithVisit } from '../interfaces/review-with-visit.interface.js';
import { reviewOrderBy } from '../rules/review-order.rules.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';

/** Staff-side review management: search, hide/publish, reply and delete. */
@Injectable()
export class ReviewModerationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aggregates: ReviewAggregatesService,
    private readonly audit: ReviewAuditService,
    private readonly visits: BookingVisitsService,
  ) {}

  async search(
    locationId: string,
    dto: ReviewSearchRequestDto,
  ): Promise<ReviewPage<ReviewWithVisit>> {
    const where = this.searchWhere(locationId, dto);
    const orderBy = reviewOrderBy(dto.orderBy, dto.orderDirection);
    const [items, totalItems] = await this.db.$transaction([
      this.db.review.findMany({
        where,
        orderBy,
        include: { staff: true },
        ...(!dto.isExport && {
          skip: (dto.page - 1) * dto.pageSize,
          take: dto.pageSize,
        }),
      }),
      this.db.review.count({ where }),
    ]);
    return { items: await this.withVisits(locationId, items), totalItems };
  }

  /** Location-wide, narrowed to one staff member and/or one client when given. */
  async getSummary(
    locationId: string,
    { staffId, clientId }: ReviewSummaryRequestDto,
  ): Promise<ReviewAdminSummary> {
    const scope: Prisma.ReviewWhereInput = {
      locationId,
      ...(staffId && { staff: { some: { staffId } } }),
      ...(clientId && { clientId }),
    };
    const [summary, hiddenCount, unansweredCount] = await Promise.all([
      this.loadSummary(locationId, staffId, clientId),
      this.db.review.count({
        where: { ...scope, status: ReviewStatus.HIDDEN },
      }),
      this.db.review.count({
        where: { ...scope, status: ReviewStatus.PUBLISHED, replyText: null },
      }),
    ]);
    return { summary, hiddenCount, unansweredCount };
  }

  async findById(locationId: string, id: string): Promise<ReviewWithVisit> {
    return this.withVisit(await this.findOwned(locationId, id));
  }

  async setVisibility(
    locationId: string,
    id: string,
    dto: UpdateReviewVisibilityDto,
    actor: AuditActor,
  ): Promise<ReviewWithVisit> {
    const before = await this.findOwned(locationId, id);
    const hiding = dto.status === ReviewStatus.HIDDEN;
    const reason = hiding ? dto.reason?.trim() || null : null;
    if (before.status === dto.status && before.hiddenReason === reason)
      return this.withVisit(before);
    return this.withVisit(
      await this.apply(
        before,
        {
          status: dto.status,
          hiddenAt: hiding ? (before.hiddenAt ?? new Date()) : null,
          hiddenReason: reason,
        },
        AuditEvent.REVIEW_VISIBILITY_CHANGED,
        actor,
      ),
    );
  }

  async saveReply(
    locationId: string,
    id: string,
    text: string,
    actor: AuditActor,
  ): Promise<ReviewWithVisit> {
    const before = await this.findOwned(locationId, id);
    if (before.replyText === text) return this.withVisit(before);
    return this.withVisit(
      await this.apply(
        before,
        { replyText: text, repliedAt: new Date(), repliedByName: actor.name },
        AuditEvent.REVIEW_REPLIED,
        actor,
      ),
    );
  }

  async deleteReply(
    locationId: string,
    id: string,
    actor: AuditActor,
  ): Promise<void> {
    const before = await this.findOwned(locationId, id);
    if (before.replyText == null)
      throw new AppException(
        ErrorCode.REVIEW_REPLY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    await this.apply(
      before,
      { replyText: null, repliedAt: null, repliedByName: null },
      AuditEvent.REVIEW_REPLY_DELETED,
      actor,
    );
  }

  /** Hard delete: the audit entry keeps the last snapshot. */
  async delete(
    locationId: string,
    id: string,
    actor: AuditActor,
  ): Promise<void> {
    const before = await this.findOwned(locationId, id);
    try {
      await this.db.review.delete({ where: { id } });
    } catch (error) {
      throw this.mapNotFound(error);
    }
    await this.aggregates.invalidateLocation(locationId);
    this.audit.emit({
      actor,
      eventType: AuditEvent.REVIEW_DELETED,
      actionType: AuditActionType.DELETE,
      before,
      after: null,
    });
  }

  private async apply(
    before: ReviewWithStaff,
    data: Prisma.ReviewUpdateInput,
    eventType: AuditEvent,
    actor: AuditActor,
  ): Promise<ReviewWithStaff> {
    let review: ReviewWithStaff;
    try {
      review = await this.db.review.update({
        where: { id: before.id },
        data,
        include: { staff: true },
      });
    } catch (error) {
      throw this.mapNotFound(error);
    }
    await this.aggregates.invalidateLocation(review.locationId);
    this.audit.emit({
      actor,
      eventType,
      actionType: AuditActionType.MODIFY,
      before,
      after: review,
    });
    return review;
  }

  private async findOwned(
    locationId: string,
    id: string,
  ): Promise<ReviewWithStaff> {
    const review = await this.db.review.findFirst({
      where: { id, locationId },
      include: { staff: true },
    });
    if (!review) throw this.notFound();
    return review;
  }

  private async withVisit(review: ReviewWithStaff): Promise<ReviewWithVisit> {
    const [withVisit] = await this.withVisits(review.locationId, [review]);
    return withVisit;
  }

  /** One query for the whole page; imported reviews have no booking to look up. */
  private async withVisits(
    locationId: string,
    reviews: readonly ReviewWithStaff[],
  ): Promise<ReviewWithVisit[]> {
    const visits = await this.visits.findByBookingIds(
      locationId,
      reviews.flatMap((review) => review.bookingId ?? []),
    );
    return reviews.map((review) => ({
      ...review,
      visit: (review.bookingId && visits.get(review.bookingId)) || null,
    }));
  }

  private loadSummary(
    locationId: string,
    staffId?: string,
    clientId?: string,
  ): Promise<ReviewSummary> {
    if (clientId)
      return this.aggregates.getClientSummary(locationId, clientId, staffId);
    if (staffId) return this.aggregates.getStaffSummary(locationId, staffId);
    return this.aggregates.getLocationSummary(locationId);
  }

  private searchWhere(
    locationId: string,
    dto: ReviewSearchRequestDto,
  ): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = { locationId };
    if (dto.status) where.status = dto.status;
    if (dto.rating !== undefined) where.rating = dto.rating;
    if (dto.staffId) where.staff = { some: { staffId: dto.staffId } };
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.replied !== undefined)
      where.replyText = dto.replied ? { not: null } : null;
    if (dto.from || dto.to)
      where.reviewedAt = {
        ...(dto.from && { gte: new Date(dto.from) }),
        ...(dto.to && { lte: new Date(dto.to) }),
      };
    const search = dto.search?.trim();
    if (search)
      where.OR = [
        { authorFirstName: { contains: search, mode: 'insensitive' } },
        { authorLastName: { contains: search, mode: 'insensitive' } },
        { text: { contains: search, mode: 'insensitive' } },
        { replyText: { contains: search, mode: 'insensitive' } },
      ];
    return where;
  }

  private notFound(): AppException {
    return new AppException(ErrorCode.REVIEW_NOT_FOUND, HttpStatus.NOT_FOUND);
  }

  private mapNotFound(error: unknown): unknown {
    return (error as { code?: string })?.code ===
      PrismaErrorCode.RECORD_NOT_FOUND
      ? this.notFound()
      : error;
  }
}
