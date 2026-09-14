import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { BusinessResponseDto } from './business-response.dto.js';

export class BusinessSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => BusinessResponseDto, isArray: true })
  items: BusinessResponseDto[];

  constructor(
    items: BusinessResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
