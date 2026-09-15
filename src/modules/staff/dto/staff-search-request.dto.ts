import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { StaffSearchOrderBy } from '../enums/staff-search-order-by.enum.js';

export class StaffSearchRequestDto extends PaginationRequestDto<StaffSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({ enum: StaffSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(StaffSearchOrderBy)
  declare orderBy?: StaffSearchOrderBy;
}
