import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../../shared/dto/pagination-request.dto.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';

export enum StaffEarningSearchOrderBy {
  EARNED_ON = 'earnedOn',
  CREATED_AT = 'createdAt',
}

export class StaffEarningSearchRequestDto extends PaginationRequestDto<StaffEarningSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

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
