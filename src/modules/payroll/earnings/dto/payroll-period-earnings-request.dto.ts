import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';
import { StaffEarningSearchOrderBy } from './staff-earning-search-request.dto.js';

export class PayrollPeriodEarningsRequestDto extends PaginationRequestDto<StaffEarningSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ enum: StaffEarningType, enumName: 'StaffEarningType', required: false })
  @IsOptional()
  @IsEnum(StaffEarningType)
  type?: StaffEarningType;
}
