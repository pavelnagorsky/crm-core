import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { BusinessSearchItemDto } from './business-search-item.dto.js';

export class BusinessSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => BusinessSearchItemDto, isArray: true })
  items: BusinessSearchItemDto[];

  constructor(
    items: BusinessSearchItemDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
