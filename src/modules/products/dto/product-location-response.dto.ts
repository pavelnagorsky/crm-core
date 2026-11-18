import { ApiProperty } from '@nestjs/swagger';
import { ProductLocation } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class ProductLocationResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  productId: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiPrice({ nullable: true })
  retailPrice: string | null;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  status: ProductStatus;

  @ApiProperty({ type: Boolean })
  trackInventory: boolean;

  @ApiProperty({ type: String, format: 'decimal' })
  reorderLevel: string;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(entity: ProductLocation): ProductLocationResponseDto {
    return Object.assign(new ProductLocationResponseDto(), entity, {
      retailPrice:
        entity.retailPrice == null
          ? null
          : MoneyUtils.format(entity.retailPrice),
      reorderLevel: QuantityUtils.format(entity.reorderLevel),
    });
  }
}
