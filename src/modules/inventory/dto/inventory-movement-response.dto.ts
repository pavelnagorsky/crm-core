import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovement } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
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
    return Object.assign(new InventoryMovementResponseDto(), entity, {
      quantityDelta: QuantityService.format(entity.quantityDelta),
      quantityBefore: QuantityService.format(entity.quantityBefore),
      quantityAfter: QuantityService.format(entity.quantityAfter),
      averageUnitCostBefore: MoneyService.format(entity.averageUnitCostBefore),
      averageUnitCostAfter: MoneyService.format(entity.averageUnitCostAfter),
      unitCost: MoneyService.format(entity.unitCost),
      totalCost: MoneyService.format(entity.totalCost),
    });
  }
}
