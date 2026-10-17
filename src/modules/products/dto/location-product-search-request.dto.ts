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
import { ProductLocationSearchOrderBy } from '../enums/product-location-search-order-by.enum.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class LocationProductSearchRequestDto extends PaginationRequestDto<ProductLocationSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  @ParseBoolean()
  trackInventory?: boolean;

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

  @ApiProperty({
    enum: ProductLocationSearchOrderBy,
    enumName: 'ProductLocationSearchOrderBy',
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductLocationSearchOrderBy)
  declare orderBy?: ProductLocationSearchOrderBy;
}
