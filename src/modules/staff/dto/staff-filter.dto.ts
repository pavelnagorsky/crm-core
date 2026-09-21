import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { StaffSearchOrderBy } from '../enums/staff-search-order-by.enum.js';

/**
 * Shared filter surface for staff listing and staff KPI widgets. Both the `/search` table
 * and the `/widgets` KPI cards extend this so a manager's active filters narrow the cards
 * and the list together. Extends PaginationRequestDto so search inherits paging; widgets
 * ignore the paging fields (all optional with defaults).
 */
export class StaffFilterDto extends PaginationRequestDto<StaffSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

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
}
