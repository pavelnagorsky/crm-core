import { ApiProperty } from '@nestjs/swagger';
import { ReviewSummary } from '../interfaces/review-summary.interface.js';
import { ReviewRatingBucketDto } from './review-rating-bucket.dto.js';

export class ReviewSummaryDto {
  @ApiProperty()
  count: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'One decimal place; null until the location has enough reviews for a meaningful average',
  })
  average: number | null;

  @ApiProperty({
    type: () => ReviewRatingBucketDto,
    isArray: true,
    description: 'Review counts per rating, from 5 down to 1',
  })
  distribution: ReviewRatingBucketDto[];

  static fromSummary(summary: ReviewSummary): ReviewSummaryDto {
    return Object.assign(new ReviewSummaryDto(), {
      count: summary.count,
      average: summary.average,
      distribution: ([5, 4, 3, 2, 1] as const).map((rating) =>
        Object.assign(new ReviewRatingBucketDto(), {
          rating,
          count: summary.distribution[rating],
        }),
      ),
    });
  }
}
