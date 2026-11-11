import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../../database/database.service.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { ImportedReview } from '../interfaces/imported-review.interface.js';
import { ReviewImportCompletion } from '../interfaces/review-import-completion.interface.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';

/** Writes reviews migrated from another CRM. */
@Injectable()
export class ReviewImportStoreService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly aggregates: ReviewAggregatesService,
    private readonly audit: ReviewAuditService,
  ) {}

  /**
   * One transaction per batch. Reviews whose import key already exists in the location are
   * skipped; returns how many were inserted. Summaries are not invalidated here, see `complete`.
   */
  async insertBatch(
    locationId: string,
    batchId: string,
    reviews: readonly ImportedReview[],
  ): Promise<number> {
    const byKey = new Map<string, ImportedReview>();
    for (const review of reviews)
      if (!byKey.has(review.importKey)) byKey.set(review.importKey, review);
    if (byKey.size === 0) return 0;

    return this.db.$transaction(async (tx) => {
      if (!(await this.locations.acquireActiveOperationLock(locationId, tx)))
        throw new NotFoundException('Location not found');

      const created = await tx.review.createManyAndReturn({
        data: [...byKey.values()].map((review) => ({
          id: randomUUID(),
          locationId,
          rating: review.rating,
          text: review.text,
          authorFirstName: review.authorFirstName,
          authorLastName: review.authorLastName,
          reviewedAt: review.reviewedAt,
          source: review.source,
          replyText: review.replyText,
          repliedAt: review.replyText ? review.reviewedAt : null,
          repliedByName: null,
          importKey: review.importKey,
          importBatchId: batchId,
        })),
        skipDuplicates: true,
        select: { id: true, importKey: true },
      });

      const staff = created.flatMap(
        ({ id, importKey }) =>
          byKey
            .get(importKey ?? '')
            ?.staff.map((member) => ({ reviewId: id, ...member })) ?? [],
      );
      if (staff.length > 0)
        await tx.reviewStaff.createMany({ data: staff, skipDuplicates: true });
      return created.length;
    });
  }

  /** Called once per import: resets cached summaries and records one audit entry. */
  async complete(
    locationId: string,
    completion: ReviewImportCompletion,
    actor: AuditActor,
  ): Promise<void> {
    if (completion.importedCount === 0) return;
    await this.aggregates.invalidateLocation(locationId);
    this.audit.emitImport(locationId, completion, actor);
  }
}
