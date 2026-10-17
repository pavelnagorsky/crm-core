import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocumentItem } from '@prisma/client';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
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

  @ApiUnitCost(true)
  unitCost: string | null;

  @ApiSignedAmount({ nullable: true })
  totalCost: string | null;

  @ApiProperty({ type: String, nullable: true })
  packagingId: string | null;

  @ApiProperty({ type: String, nullable: true })
  packagingName: string | null;

  @ApiProperty({ type: String, format: 'decimal', nullable: true })
  packagingFactor: string | null;

  @ApiProperty({ type: String, format: 'decimal', nullable: true })
  packageQuantity: string | null;

  @ApiPrice({ nullable: true })
  packageUnitCost: string | null;

  static fromEntity(
    entity: InventoryDocumentItem,
  ): InventoryDocumentItemResponseDto {
    const dto = new InventoryDocumentItemResponseDto();
    dto.id = entity.id;
    dto.productId = entity.productId;
    dto.productName = entity.productName;
    dto.productSku = entity.productSku;
    dto.productUnit = entity.productUnit;
    dto.quantity = QuantityUtils.format(entity.quantity);
    dto.unitCost =
      entity.unitCost == null ? null : UnitCostUtils.format(entity.unitCost);
    dto.totalCost =
      entity.totalCost == null ? null : MoneyUtils.format(entity.totalCost);
    dto.packagingId = entity.packagingId;
    dto.packagingName = entity.packagingName;
    dto.packagingFactor =
      entity.packagingFactor == null
        ? null
        : QuantityUtils.format(entity.packagingFactor);
    dto.packageQuantity =
      entity.packageQuantity == null
        ? null
        : QuantityUtils.format(entity.packageQuantity);
    dto.packageUnitCost =
      entity.packageUnitCost == null
        ? null
        : MoneyUtils.format(entity.packageUnitCost);
    return dto;
  }
}
