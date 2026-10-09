import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { InventoryKpiView } from '../interfaces/inventory-kpi-view.interface.js';
import { InventoryReplenishmentItemDto } from './inventory-replenishment-item.dto.js';

export class InventoryKpiResponseDto {
  @ApiProperty({ type: Number })
  totalProducts: number;

  @ApiProperty({ type: Number })
  lowStockCount: number;

  @ApiProperty({ type: Number })
  outOfStockCount: number;

  @ApiPrice()
  stockValue: string;

  @ApiProperty({ type: Number })
  deadStockCount: number;

  @ApiProperty({ type: Number })
  movingProductsCount: number;

  @ApiProperty({ type: () => InventoryReplenishmentItemDto, isArray: true })
  topReplenishmentItems: InventoryReplenishmentItemDto[];

  static fromEntity(entity: InventoryKpiView): InventoryKpiResponseDto {
    return Object.assign(new InventoryKpiResponseDto(), entity, {
      stockValue: MoneyService.format(entity.stockValue),
      topReplenishmentItems: entity.topReplenishmentItems.map(
        InventoryReplenishmentItemDto.fromEntity,
      ),
    });
  }
}
