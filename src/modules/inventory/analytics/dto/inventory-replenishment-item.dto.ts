import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { QuantityService } from '../../../../shared/quantity/quantity.service.js';
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
      quantityOnHand: QuantityService.format(entity.quantityOnHand),
      reorderLevel: QuantityService.format(entity.reorderLevel),
      missingQuantity: QuantityService.format(entity.missingQuantity),
      stockValue: MoneyService.format(entity.stockValue),
      updatedAt: entity.updatedAt?.toISOString() ?? null,
    });
  }
}
