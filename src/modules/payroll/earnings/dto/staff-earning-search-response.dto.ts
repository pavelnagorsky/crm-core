import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../../shared/dto/pagination-response.dto.js';
import { StaffEarningResponseDto } from './staff-earning-response.dto.js';

export class StaffEarningSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => StaffEarningResponseDto, isArray: true })
  items: StaffEarningResponseDto[];

  constructor(
    items: StaffEarningResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
