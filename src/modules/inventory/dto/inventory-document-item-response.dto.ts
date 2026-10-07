import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocumentItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';

export class InventoryDocumentItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String })
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  productSku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  productUnit: ProductUnit;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiPrice({ nullable: true })
  unitCost: string | null;

  static fromEntity(
    entity: InventoryDocumentItem,
  ): InventoryDocumentItemResponseDto {
    return Object.assign(new InventoryDocumentItemResponseDto(), entity, {
      quantity: QuantityService.format(entity.quantity),
      unitCost:
        entity.unitCost == null ? null : MoneyService.format(entity.unitCost),
    });
  }
}
