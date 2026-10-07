import { ApiProperty } from '@nestjs/swagger';
import { OrderItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { OrderItemStatus } from '../enums/order-item-status.enum.js';
import { OrderItemType } from '../enums/order-item-type.enum.js';

export class OrderItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ enum: OrderItemType, enumName: 'OrderItemType' })
  type: OrderItemType;

  @ApiProperty({ enum: OrderItemStatus, enumName: 'OrderItemStatus' })
  status: OrderItemStatus;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bookingItemId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  catalogItemId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit', nullable: true })
  unit: ProductUnit | null;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiPrice()
  listUnitPrice: string;

  @ApiPrice({ nullable: true })
  customUnitPrice: string | null;

  @ApiPrice()
  unitPrice: string;

  @ApiPrice()
  lineSubtotal: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice()
  lineTotal: string;

  @ApiPrice({ nullable: true })
  unitCostSnapshot: string | null;

  @ApiPrice({ nullable: true })
  lineCostSnapshot: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sellerStaffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  sellerName: string | null;

  @ApiProperty({ type: Date, nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  occurredAt: Date | null;

  static fromEntity(entity: OrderItem): OrderItemResponseDto {
    return Object.assign(new OrderItemResponseDto(), entity, {
      quantity: QuantityService.format(entity.quantity),
      listUnitPrice: MoneyService.format(entity.listUnitPrice),
      customUnitPrice:
        entity.customUnitPrice == null
          ? null
          : MoneyService.format(entity.customUnitPrice),
      unitPrice: MoneyService.format(entity.unitPrice),
      lineSubtotal: MoneyService.format(entity.lineSubtotal),
      discountTotal: MoneyService.format(entity.discountTotal),
      lineTotal: MoneyService.format(entity.lineTotal),
      unitCostSnapshot:
        entity.unitCostSnapshot == null
          ? null
          : MoneyService.format(entity.unitCostSnapshot),
      lineCostSnapshot:
        entity.lineCostSnapshot == null
          ? null
          : MoneyService.format(entity.lineCostSnapshot),
    });
  }
}
