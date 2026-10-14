import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovement } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
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

  @ApiPrice()
  averageUnitCostBefore: string;

  @ApiPrice()
  averageUnitCostAfter: string;

  @ApiPrice()
  unitCost: string;

  @ApiPrice()
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
    dto.quantityDelta = QuantityService.format(entity.quantityDelta);
    dto.quantityBefore = QuantityService.format(entity.quantityBefore);
    dto.quantityAfter = QuantityService.format(entity.quantityAfter);
    dto.averageUnitCostBefore = MoneyService.format(
      entity.averageUnitCostBefore,
    );
    dto.averageUnitCostAfter = MoneyService.format(entity.averageUnitCostAfter);
    dto.unitCost = MoneyService.format(entity.unitCost);
    dto.totalCost = MoneyService.format(entity.totalCost);
    dto.occurredAt = entity.occurredAt;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
