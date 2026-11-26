import { ApiProperty } from '@nestjs/swagger';
import { PriceAdjustmentKind } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { OrderItemStatus } from '../enums/order-item-status.enum.js';
import { OrderItemType } from '../enums/order-item-type.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { postedReturns } from '../rules/order-return-allocation.rules.js';
import { OrderPriceAdjustmentDto } from './order-price-adjustment.dto.js';

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

  @ApiPrice({ description: 'Catalog price before staff level, surcharges and discounts' })
  baseUnitPrice: string;

  @ApiPrice({ description: 'Price list price, before the discount' })
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

  @ApiProperty({
    type: () => OrderPriceAdjustmentDto,
    isArray: true,
    description:
      'Price layers: of the booking item for a service line, the discount for a product line.',
  })
  adjustments: OrderPriceAdjustmentDto[];

  @ApiProperty({
    type: () => OrderPriceAdjustmentDto,
    nullable: true,
    description: 'PROMOTION or CLIENT_DISCOUNT layer of the line.',
  })
  discount: OrderPriceAdjustmentDto | null;

  @ApiProperty({
    type: () => PromotionChoiceDto,
    nullable: true,
    description: 'Stored discount choice of a product line; null = AUTO.',
  })
  promotion: PromotionChoiceDto | null;

  @ApiPrice({ description: 'Σ lineTotal of posted returns of the line.' })
  returnedAmount: string;

  @ApiPrice({
    description:
      'CONFIRMED: lineTotal - returnedAmount ("К возврату" of the whole rest); otherwise "0.00".',
  })
  returnableAmount: string;

  @ApiProperty({ type: Date, nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  occurredAt: Date | null;

  static fromEntity(
    entity: OrderWithItems['items'][number],
  ): OrderItemResponseDto {
    const returned = postedReturns(entity);
    const returnedQuantity = returned.quantity;
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
    dto.baseUnitPrice = MoneyUtils.format(entity.baseUnitPrice);
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
    dto.adjustments = entity.priceAdjustments.map(
      OrderPriceAdjustmentDto.fromLayer,
    );
    const discount = entity.priceAdjustments.find(
      (layer) =>
        layer.kind === PriceAdjustmentKind.PROMOTION ||
        layer.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
    );
    dto.discount = discount ? OrderPriceAdjustmentDto.fromLayer(discount) : null;
    dto.promotion =
      entity.discountChoice === null ||
      entity.discountChoice === DiscountChoiceMode.AUTO
        ? null
        : Object.assign(new PromotionChoiceDto(), {
            mode: entity.discountChoice,
            ruleId: entity.discountChoiceRuleId,
          });
    dto.returnedAmount = MoneyUtils.format(returned.lineTotal);
    dto.returnableAmount = MoneyUtils.format(
      entity.status === OrderItemStatus.CONFIRMED
        ? entity.lineTotal.minus(returned.lineTotal)
        : 0,
    );
    dto.sellerStaffId = entity.sellerStaffId;
    dto.sellerName = entity.sellerName;
    dto.confirmedAt = entity.confirmedAt;
    dto.occurredAt = entity.occurredAt;
    return dto;
  }
}
