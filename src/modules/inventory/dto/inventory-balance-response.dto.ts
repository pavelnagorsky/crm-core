import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
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

  @ApiPrice()
  averageUnitCost: string;

  @ApiPrice()
  stockValue: string;

  @ApiProperty({ type: String, format: 'decimal' })
  reorderLevel: string;

  @ApiProperty({ type: Boolean })
  lowStock: boolean;

  @ApiProperty({ type: Date, nullable: true })
  updatedAt: Date | null;

  static fromEntity(entity: InventoryBalanceView): InventoryBalanceResponseDto {
    return Object.assign(new InventoryBalanceResponseDto(), entity, {
      quantityOnHand: QuantityService.format(entity.quantityOnHand),
      averageUnitCost: MoneyService.format(entity.averageUnitCost),
      stockValue: MoneyService.format(entity.stockValue),
      reorderLevel: QuantityService.format(entity.reorderLevel),
    });
  }
}
