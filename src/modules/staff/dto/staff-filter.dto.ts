import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { StaffSearchOrderBy } from '../enums/staff-search-order-by.enum.js';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class StaffFilterDto extends PaginationRequestDto<StaffSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus', required: false })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
