import { ApiProperty } from '@nestjs/swagger';
import { ReviewAdminSummary } from '../interfaces/review-admin-summary.interface.js';
import { ReviewSummaryDto } from './review-summary.dto.js';

export class ReviewAdminSummaryDto {
  @ApiProperty({
    type: () => ReviewSummaryDto,
    description: 'Published reviews only, the same figures clients see',
  })
  summary: ReviewSummaryDto;

  @ApiProperty({ description: 'Reviews hidden from the public' })
  hiddenCount: number;

  @ApiProperty({ description: 'Published reviews without a reply' })
  unansweredCount: number;

  static fromEntity(summary: ReviewAdminSummary): ReviewAdminSummaryDto {
    return Object.assign(new ReviewAdminSummaryDto(), {
      summary: ReviewSummaryDto.fromSummary(summary.summary),
      hiddenCount: summary.hiddenCount,
      unansweredCount: summary.unansweredCount,
    });
  }
}
