import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { REVIEWS_LATEST_COUNT } from '../constants/reviews.constants.js';
import { REVIEW_LOCATION_OVERVIEW_CACHE } from '../cache/review-location-overview.cache.js';
import { REVIEW_STAFF_SUMMARIES_CACHE } from '../cache/review-staff-summaries.cache.js';
import { ReviewLocationOverview } from '../interfaces/review-location-overview.interface.js';
import { ReviewRatingGroup } from '../interfaces/review-rating-group.interface.js';
import { ReviewStaffSummary } from '../interfaces/review-staff-summary.interface.js';
import { ReviewSummary } from '../interfaces/review-summary.interface.js';
import { buildReviewSummary } from '../rules/review-summary.rules.js';

/** Published-only rating aggregates; hidden reviews never count. */
@Injectable()
export class ReviewAggregatesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: AppCacheService,
  ) {}

  getLocationOverview(locationId: string): Promise<ReviewLocationOverview> {
    return this.cache.getOrLoad(
      REVIEW_LOCATION_OVERVIEW_CACHE,
      { locationId },
      async () => {
        const [summary, latest] = await Promise.all([
          this.loadLocationSummary(locationId),
          this.db.review.findMany({
            where: { locationId, status: ReviewStatus.PUBLISHED },
            orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
            take: REVIEWS_LATEST_COUNT,
            include: { staff: true },
          }),
        ]);
        return { summary, latest };
      },
    );
  }

  async getLocationSummary(locationId: string): Promise<ReviewSummary> {
    return (await this.getLocationOverview(locationId)).summary;
  }

  /** Summary with distribution of one master; zero counts while they have no published reviews. */
  async getStaffSummary(
    locationId: string,
    staffId: string,
  ): Promise<ReviewSummary> {
    const all = await this.loadCachedStaffSummaries(locationId);
    return all[staffId] ?? buildReviewSummary([]);
  }

  /** Staff without published reviews are absent from the result. */
  async getStaffSummaries(
    locationId: string,
    staffIds: readonly string[],
  ): Promise<Map<string, ReviewStaffSummary>> {
    if (staffIds.length === 0) return new Map();
    const all = await this.loadCachedStaffSummaries(locationId);
    return new Map(
      staffIds.flatMap((id) => (all[id] ? [[id, all[id]] as const] : [])),
    );
  }

  invalidateLocation(locationId: string): Promise<void> {
    return this.cache.invalidate(CacheDependency.locationReviews(locationId));
  }

  private async loadLocationSummary(
    locationId: string,
  ): Promise<ReviewSummary> {
    const groups = await this.db.review.groupBy({
      by: ['rating'],
      where: { locationId, status: ReviewStatus.PUBLISHED },
      _count: { _all: true },
    });
    return buildReviewSummary(
      groups.map((group) => ({
        rating: group.rating,
        count: group._count._all,
      })),
    );
  }

  private loadCachedStaffSummaries(
    locationId: string,
  ): Promise<Record<string, ReviewSummary>> {
    return this.cache.getOrLoad(
      REVIEW_STAFF_SUMMARIES_CACHE,
      { locationId },
      () => this.loadStaffSummaries(locationId),
    );
  }

  private async loadStaffSummaries(
    locationId: string,
  ): Promise<Record<string, ReviewSummary>> {
    const rows = await this.db.$queryRaw<
      { staffId: string; rating: number; count: number }[]
    >`
      SELECT rs."staffId", r."rating", COUNT(*)::int AS "count"
      FROM "ReviewStaff" rs
      JOIN "Review" r ON r."id" = rs."reviewId"
      WHERE r."locationId" = ${locationId} AND r."status" = 'PUBLISHED'
      GROUP BY rs."staffId", r."rating"
    `;
    const byStaff = new Map<string, ReviewRatingGroup[]>();
    for (const row of rows) {
      const groups = byStaff.get(row.staffId) ?? [];
      groups.push({ rating: row.rating, count: row.count });
      byStaff.set(row.staffId, groups);
    }
    return Object.fromEntries(
      [...byStaff].map(([staffId, groups]) => [
        staffId,
        buildReviewSummary(groups),
      ]),
    );
  }
}
