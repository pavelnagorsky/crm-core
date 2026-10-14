import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';
import { InventorySearchOrderBy } from '../enums/inventory-search-order-by.enum.js';

export class InventorySearchRequestDto extends PaginationRequestDto<InventorySearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    required: false,
    description:
      'Filter by products. Repeat the key: ?productIds=UUID1&productIds=UUID2. A single value is accepted as a one-element array.',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  lowStock?: boolean;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  outOfStock?: boolean;

  @ApiProperty({ enum: InventorySearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(InventorySearchOrderBy)
  declare orderBy?: InventorySearchOrderBy;
}
