import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../../shared/dto/pagination-response.dto.js';
import { PayrollPeriodResponseDto } from './payroll-period-response.dto.js';

export class PayrollPeriodSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => PayrollPeriodResponseDto, isArray: true })
  items: PayrollPeriodResponseDto[];

  constructor(
    items: PayrollPeriodResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
