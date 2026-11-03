import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { FeedbackResponseDto } from './feedback-response.dto.js';

export class FeedbackSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => FeedbackResponseDto, isArray: true })
  items: FeedbackResponseDto[];

  constructor(
    items: FeedbackResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
