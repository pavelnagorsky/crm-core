import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProductStatus } from '../enums/product-status.enum.js';

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
