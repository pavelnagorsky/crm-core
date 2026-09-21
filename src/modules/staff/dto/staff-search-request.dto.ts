import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StaffFilterDto } from './staff-filter.dto.js';
import { StaffSearchOrderBy } from '../enums/staff-search-order-by.enum.js';

export class StaffSearchRequestDto extends StaffFilterDto {
  @ApiProperty({ enum: StaffSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(StaffSearchOrderBy)
  declare orderBy?: StaffSearchOrderBy;
}
