import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ProductStatus } from '../enums/product-status.enum.js';
import { ProductUnit } from '../enums/product-unit.enum.js';

export class CreateProductDto {
  @ApiProperty({ type: String, maxLength: 150 })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    type: String,
    maxLength: 2000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @ApiProperty({ type: String, maxLength: 80, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @ApiProperty({ type: String, maxLength: 80, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit', required: false })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiProperty({
    enum: ProductStatus,
    enumName: 'ProductStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
