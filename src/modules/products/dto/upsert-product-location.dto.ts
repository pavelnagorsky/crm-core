import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsOptionalQuantity } from '../../../shared/decorators/is-quantity.decorator.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class UpsertProductLocationDto {
  /** Required when the product is for sale; null for internal-use-only products. */
  @IsNullablePrice()
  retailPrice: string | null;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  trackInventory: boolean;

  @IsOptionalQuantity()
  reorderLevel?: string;
}
