import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { PublicReviewDto } from './public-review.dto.js';
import { ReviewSummaryDto } from './review-summary.dto.js';

export class PublicReviewListResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => PublicReviewDto, isArray: true })
  items: PublicReviewDto[];

  @ApiProperty({
    type: () => ReviewSummaryDto,
    description:
      'Summary of the staff member when `staffId` is given, otherwise of the location; `rating` does not affect it',
  })
  summary: ReviewSummaryDto;

  constructor(
    items: PublicReviewDto[],
    summary: ReviewSummaryDto,
    page: number,
    pageSize: number,
    totalItems: number,
  ) {
    super(page, pageSize, totalItems);
    this.items = items;
    this.summary = summary;
  }
}
