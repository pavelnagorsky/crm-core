import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovement } from '@prisma/client';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { InventoryMovementSourceType } from '../enums/inventory-movement-source-type.enum.js';
import { InventoryMovementType } from '../enums/inventory-movement-type.enum.js';

export class InventoryMovementResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: InventoryMovementType,
    enumName: 'InventoryMovementType',
  })
  type: InventoryMovementType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  documentId: string | null;

  @ApiProperty({
    enum: InventoryMovementSourceType,
    enumName: 'InventoryMovementSourceType',
    nullable: true,
  })
  sourceType: InventoryMovementSourceType | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceLocationId: string | null;

  @ApiProperty({ type: String })
  productName: string;

  @ApiProperty({ type: String, nullable: true })
  productSku: string | null;

  @ApiProperty({ type: String, format: 'decimal' })
  quantityDelta: string;

  @ApiProperty({ type: String, format: 'decimal' })
  quantityBefore: string;

  @ApiProperty({ type: String, format: 'decimal' })
  quantityAfter: string;

  @ApiUnitCost()
  averageUnitCostBefore: string;

  @ApiUnitCost()
  averageUnitCostAfter: string;

  @ApiPrice()
  stockValueBefore: string;

  @ApiPrice()
  stockValueAfter: string;

  @ApiUnitCost()
  unitCost: string;

  @ApiSignedAmount()
  totalCost: string;

  @ApiProperty({ type: Date })
  occurredAt: Date;

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(entity: InventoryMovement): InventoryMovementResponseDto {
    const dto = new InventoryMovementResponseDto();
    dto.id = entity.id;
    dto.type = entity.type;
    dto.documentId = entity.documentId;
    dto.sourceType = entity.sourceType;
    dto.sourceId = entity.sourceId;
    dto.sourceLocationId = entity.sourceLocationId;
    dto.productName = entity.productName;
    dto.productSku = entity.productSku;
    dto.quantityDelta = QuantityUtils.format(entity.quantityDelta);
    dto.quantityBefore = QuantityUtils.format(entity.quantityBefore);
    dto.quantityAfter = QuantityUtils.format(entity.quantityAfter);
    dto.averageUnitCostBefore = UnitCostUtils.format(
      entity.averageUnitCostBefore,
    );
    dto.averageUnitCostAfter = UnitCostUtils.format(
      entity.averageUnitCostAfter,
    );
    dto.stockValueBefore = MoneyUtils.format(entity.stockValueBefore);
    dto.stockValueAfter = MoneyUtils.format(entity.stockValueAfter);
    dto.unitCost = UnitCostUtils.format(entity.unitCost);
    dto.totalCost = MoneyUtils.format(entity.totalCost);
    dto.occurredAt = entity.occurredAt;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
