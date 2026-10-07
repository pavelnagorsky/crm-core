import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsOptionalQuantity } from '../../../shared/decorators/is-quantity.decorator.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class UpsertProductLocationDto {
  @IsPrice()
  retailPrice: string;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  trackInventory: boolean;

  @IsOptionalQuantity()
  reorderLevel?: string;
}
