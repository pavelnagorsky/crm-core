import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import { PayrollPeriodStatus } from '../enums/payroll-period-status.enum.js';

export enum PayrollPeriodSearchOrderBy {
  START_DATE = 'startDate',
  CREATED_AT = 'createdAt',
}

export class PayrollPeriodSearchRequestDto extends PaginationRequestDto<PayrollPeriodSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ enum: PayrollPeriodStatus, enumName: 'PayrollPeriodStatus', required: false })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}
