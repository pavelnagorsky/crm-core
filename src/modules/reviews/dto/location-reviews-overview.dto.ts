import { ApiProperty } from '@nestjs/swagger';
import { ReviewLocationOverview } from '../interfaces/review-location-overview.interface.js';
import { PublicReviewDto } from './public-review.dto.js';
import { ReviewSummaryDto } from './review-summary.dto.js';

export class LocationReviewsOverviewDto {
  @ApiProperty({ type: () => ReviewSummaryDto })
  summary: ReviewSummaryDto;

  @ApiProperty({ type: () => PublicReviewDto, isArray: true })
  latest: PublicReviewDto[];

  /** Null while the location has no published reviews: clients render nothing. */
  static fromOverview(
    overview: ReviewLocationOverview,
  ): LocationReviewsOverviewDto | null {
    if (overview.summary.count === 0) return null;
    return Object.assign(new LocationReviewsOverviewDto(), {
      summary: ReviewSummaryDto.fromSummary(overview.summary),
      latest: overview.latest.map(PublicReviewDto.fromEntity),
    });
  }
}
