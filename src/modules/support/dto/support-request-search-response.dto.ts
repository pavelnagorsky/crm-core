import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { SupportRequestResponseDto } from './support-request-response.dto.js';

export class SupportRequestSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => SupportRequestResponseDto, isArray: true })
  items: SupportRequestResponseDto[];

  constructor(
    items: SupportRequestResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
