import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { OrderItemStatus } from '../enums/order-item-status.enum.js';
import { OrderItemType } from '../enums/order-item-type.enum.js';
import { OrderReturnStatus } from '../enums/order-return-status.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';

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

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit', nullable: true })
  unit: ProductUnit | null;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiProperty({ type: String, format: 'decimal' })
  returnedQuantity: string;

  @ApiProperty({ type: String, format: 'decimal' })
  returnableQuantity: string;

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

  @ApiUnitCost(true)
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

  static fromEntity(
    entity: OrderWithItems['items'][number],
  ): OrderItemResponseDto {
    const returnedQuantity = entity.returnItems
      .filter((item) => item.return.status === OrderReturnStatus.POSTED)
      .reduce((sum, item) => sum.plus(item.quantity), QuantityUtils.decimal(0));
    const returnableQuantity =
      entity.status === OrderItemStatus.CONFIRMED
        ? entity.quantity.minus(returnedQuantity)
        : QuantityUtils.decimal(0);
    const dto = new OrderItemResponseDto();
    dto.id = entity.id;
    dto.type = entity.type;
    dto.status = entity.status;
    dto.bookingItemId = entity.bookingItemId;
    dto.catalogItemId = entity.catalogItemId;
    dto.categoryId = entity.categoryId;
    dto.title = entity.title;
    dto.sku = entity.sku;
    dto.image = entity.productLocation?.product.imageFile
      ? FileResponseDto.fromEntity(entity.productLocation.product.imageFile)
      : null;
    dto.unit = entity.unit;
    dto.quantity = QuantityUtils.format(entity.quantity);
    dto.returnedQuantity = QuantityUtils.format(returnedQuantity);
    dto.returnableQuantity = QuantityUtils.format(returnableQuantity);
    dto.listUnitPrice = MoneyUtils.format(entity.listUnitPrice);
    dto.customUnitPrice =
      entity.customUnitPrice == null
        ? null
        : MoneyUtils.format(entity.customUnitPrice);
    dto.unitPrice = MoneyUtils.format(entity.unitPrice);
    dto.lineSubtotal = MoneyUtils.format(entity.lineSubtotal);
    dto.discountTotal = MoneyUtils.format(entity.discountTotal);
    dto.lineTotal = MoneyUtils.format(entity.lineTotal);
    dto.unitCostSnapshot =
      entity.unitCostSnapshot == null
        ? null
        : UnitCostUtils.format(entity.unitCostSnapshot);
    dto.lineCostSnapshot =
      entity.lineCostSnapshot == null
        ? null
        : MoneyUtils.format(entity.lineCostSnapshot);
    dto.sellerStaffId = entity.sellerStaffId;
    dto.sellerName = entity.sellerName;
    dto.confirmedAt = entity.confirmedAt;
    dto.occurredAt = entity.occurredAt;
    return dto;
  }
}
