import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ProductSearchOrderBy } from '../enums/product-search-order-by.enum.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class ProductSearchRequestDto extends PaginationRequestDto<ProductSearchOrderBy> {
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

  @ApiProperty({
    enum: ProductSearchOrderBy,
    enumName: 'ProductSearchOrderBy',
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductSearchOrderBy)
  declare orderBy?: ProductSearchOrderBy;
}
