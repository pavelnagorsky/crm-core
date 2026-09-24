import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';
import { StaffEarningSearchOrderBy } from './staff-earning-search-request.dto.js';

export class StaffEarningsByStaffRequestDto extends PaginationRequestDto<StaffEarningSearchOrderBy> {
  @ApiProperty({ enum: StaffEarningType, enumName: 'StaffEarningType', required: false })
  @IsOptional()
  @IsEnum(StaffEarningType)
  type?: StaffEarningType;

  @ApiProperty({ type: String, required: false, example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ type: String, required: false, example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
