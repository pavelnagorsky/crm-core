import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../../shared/quantity/quantity.utils.js';
import { ProductUnit } from '../../../products/enums/product-unit.enum.js';
import { InventoryReplenishmentItemView } from '../interfaces/inventory-replenishment-item-view.interface.js';

export class InventoryReplenishmentItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  productLocationId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ type: String, nullable: true })
  barcode: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiProperty({ type: String, format: 'decimal' })
  quantityOnHand: string;

  @ApiProperty({ type: String, format: 'decimal' })
  reorderLevel: string;

  @ApiProperty({ type: String, format: 'decimal' })
  missingQuantity: string;

  @ApiPrice()
  stockValue: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt: string | null;

  static fromEntity(
    entity: InventoryReplenishmentItemView,
  ): InventoryReplenishmentItemDto {
    return Object.assign(new InventoryReplenishmentItemDto(), entity, {
      quantityOnHand: QuantityUtils.format(entity.quantityOnHand),
      reorderLevel: QuantityUtils.format(entity.reorderLevel),
      missingQuantity: QuantityUtils.format(entity.missingQuantity),
      stockValue: MoneyUtils.format(entity.stockValue),
      updatedAt: entity.updatedAt?.toISOString() ?? null,
    });
  }
}
