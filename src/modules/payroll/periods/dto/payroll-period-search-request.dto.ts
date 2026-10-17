import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import { PayrollPeriodSearchOrderBy } from '../enums/payroll-period-search-order-by.enum.js';
import { PayrollPeriodStatus } from '../enums/payroll-period-status.enum.js';

export class PayrollPeriodSearchRequestDto extends PaginationRequestDto<PayrollPeriodSearchOrderBy> {
  @ApiProperty({
    enum: PayrollPeriodStatus,
    enumName: 'PayrollPeriodStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}
