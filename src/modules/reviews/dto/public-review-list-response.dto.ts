import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { PublicReviewDto } from './public-review.dto.js';
import { ReviewSummaryDto } from './review-summary.dto.js';

export class PublicReviewListResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => PublicReviewDto, isArray: true })
  items: PublicReviewDto[];

  @ApiProperty({
    type: () => ReviewSummaryDto,
    description: 'Location-wide summary, independent of the list filters',
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
