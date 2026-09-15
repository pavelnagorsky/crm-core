import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { StaffResponseDto } from './staff-response.dto.js';

export class StaffSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => StaffResponseDto, isArray: true })
  items: StaffResponseDto[];

  constructor(
    items: StaffResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
