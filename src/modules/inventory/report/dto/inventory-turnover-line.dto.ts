import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';
import { ApiSignedAmount } from '../../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { QuantityService } from '../../../../shared/quantity/quantity.service.js';
import { ProductUnit } from '../../../products/enums/product-unit.enum.js';
import { InventoryTurnoverLine } from '../interfaces/inventory-turnover-line.interface.js';
import { INVENTORY_MOVEMENT_COLUMNS } from '../utils/inventory-turnover-lines.js';

export class InventoryTurnoverLineDto {
  @ApiProperty({ type: String, format: 'uuid' })
  productLocationId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiProperty({ type: String, format: 'decimal' })
  openingQuantity: string;

  @ApiSignedAmount()
  openingValue: string;

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string', format: 'decimal' },
  })
  quantities: Record<InventoryMovementType, string>;

  @ApiSignedAmount()
  periodValue: string;

  @ApiProperty({ type: String, format: 'decimal' })
  closingQuantity: string;

  @ApiSignedAmount()
  closingValue: string;

  static fromEntity(entity: InventoryTurnoverLine): InventoryTurnoverLineDto {
    return Object.assign(new InventoryTurnoverLineDto(), {
      productLocationId: entity.productLocationId,
      productId: entity.productId,
      name: entity.name,
      sku: entity.sku,
      unit: entity.unit,
      openingQuantity: QuantityService.format(entity.openingQuantity),
      openingValue: MoneyService.format(entity.openingValue),
      quantities: Object.fromEntries(
        INVENTORY_MOVEMENT_COLUMNS.map((type) => [
          type,
          QuantityService.format(entity.quantities[type]),
        ]),
      ) as Record<InventoryMovementType, string>,
      periodValue: MoneyService.format(entity.periodValue),
      closingQuantity: QuantityService.format(entity.closingQuantity),
      closingValue: MoneyService.format(entity.closingValue),
    });
  }
}
