import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import { InventorySearchOrderBy } from '../enums/inventory-search-order-by.enum.js';

export class InventorySearchRequestDto extends PaginationRequestDto<InventorySearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  lowStock?: boolean;

  @ApiProperty({ enum: InventorySearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventorySearchOrderBy)
  declare orderBy?: InventorySearchOrderBy;
}
