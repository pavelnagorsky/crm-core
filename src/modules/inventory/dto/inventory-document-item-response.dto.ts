import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocumentItem } from '@prisma/client';
import { UnitCostService } from '../../../shared/money/unit-cost.service.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
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
    dto.quantity = QuantityService.format(entity.quantity);
    dto.unitCost =
      entity.unitCost == null ? null : UnitCostService.format(entity.unitCost);
    dto.totalCost =
      entity.totalCost == null ? null : MoneyService.format(entity.totalCost);
    dto.packagingId = entity.packagingId;
    dto.packagingName = entity.packagingName;
    dto.packagingFactor =
      entity.packagingFactor == null
        ? null
        : QuantityService.format(entity.packagingFactor);
    dto.packageQuantity =
      entity.packageQuantity == null
        ? null
        : QuantityService.format(entity.packageQuantity);
    dto.packageUnitCost =
      entity.packageUnitCost == null
        ? null
        : MoneyService.format(entity.packageUnitCost);
    return dto;
  }
}
