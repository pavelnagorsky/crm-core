import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { InventoryBalanceView } from '../interfaces/inventory-balance-view.interface.js';

export class InventoryBalanceResponseDto {
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

  @ApiUnitCost()
  averageUnitCost: string;

  @ApiPrice()
  stockValue: string;

  @ApiProperty({ type: String, format: 'decimal' })
  reorderLevel: string;

  @ApiProperty({ type: Boolean })
  lowStock: boolean;

  @ApiProperty({ type: Boolean })
  outOfStock: boolean;

  @ApiProperty({ type: Date, nullable: true })
  updatedAt: Date | null;

  static fromEntity(entity: InventoryBalanceView): InventoryBalanceResponseDto {
    return Object.assign(new InventoryBalanceResponseDto(), entity, {
      quantityOnHand: QuantityUtils.format(entity.quantityOnHand),
      averageUnitCost: UnitCostUtils.format(entity.averageUnitCost),
      stockValue: MoneyUtils.format(entity.stockValue),
      reorderLevel: QuantityUtils.format(entity.reorderLevel),
    });
  }
}
