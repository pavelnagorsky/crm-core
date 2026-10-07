import { ApiProperty } from '@nestjs/swagger';
import { ProductLocation } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ProductStatus } from '../enums/product-status.enum.js';

export class ProductLocationResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  productId: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiPrice()
  retailPrice: string;

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
      retailPrice: MoneyService.format(entity.retailPrice),
      reorderLevel: QuantityService.format(entity.reorderLevel),
    });
  }
}
