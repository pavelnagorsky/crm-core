import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ReviewResponseDto } from './review-response.dto.js';

export class ReviewSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ReviewResponseDto, isArray: true })
  items: ReviewResponseDto[];

  constructor(
    items: ReviewResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
