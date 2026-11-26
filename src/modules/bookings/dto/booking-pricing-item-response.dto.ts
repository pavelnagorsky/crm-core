import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { OrderItemType } from '../../orders/enums/order-item-type.enum.js';
import { BookingPricingLine } from '../interfaces/booking-pricing-line.interface.js';
import { BookingPricingDiscountOptionDto } from './booking-pricing-discount-option.dto.js';
import { BookingPricingDiscountDto } from './booking-pricing-discount.dto.js';
import { BookingPricingPromotionSkipDto } from './booking-pricing-promotion-skip.dto.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { OrderPriceAdjustmentDto } from '../../orders/dto/order-price-adjustment.dto.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';
import { BookingLineStaffSource } from '../enums/booking-line-staff-source.enum.js';

export class BookingPricingItemResponseDto {
  @ApiProperty({ enum: OrderItemType, enumName: 'OrderItemType' })
  type: OrderItemType;

  @ApiProperty({ type: String, format: 'uuid' })
  catalogItemId: string;

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

  @ApiPrice()
  listLineTotal: string;

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

  @ApiProperty({
    type: () => BookingPricingDiscountDto,
    nullable: true,
    description:
      'Promotion or client discount of the line (lineTotal includes it); null without one.',
  })
  discount: BookingPricingDiscountDto | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Service lines: the staff member the line is priced with (chosen, or the one booking creation would assign, see staffSource); null for products and when nobody can take the line.',
  })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffName: string | null;

  @ApiProperty({
    enum: BookingLineStaffSource,
    enumName: 'BookingLineStaffSource',
    nullable: true,
    description:
      'REQUESTED: named in the request. ASSIGNED: the any-staff rule at startAt among free staff, the one creation assigns. ESTIMATED: the rule ignoring availability (no startAt, or nobody free at it). Null with staffId null.',
  })
  staffSource: BookingLineStaffSource | null;

  @ApiProperty({
    type: () => BookingPricingDiscountOptionDto,
    isArray: true,
    required: false,
    description:
      'Cabinet only: every discount that applies to the line, best first (the menu of the booking dialog).',
  })
  eligible?: BookingPricingDiscountOptionDto[];

  @ApiProperty({
    type: () => BookingPricingPromotionSkipDto,
    isArray: true,
    required: false,
    description:
      'Cabinet only: enabled promotions on this service that do not apply, with the reason.',
  })
  ineligible?: BookingPricingPromotionSkipDto[];

  @ApiProperty({
    type: () => OrderPriceAdjustmentDto,
    isArray: true,
    required: false,
    description:
      'Product lines only: the discount layer of the line; empty for a request without a cabinet token.',
  })
  adjustments?: OrderPriceAdjustmentDto[];

  @ApiProperty({
    type: () => PromotionChoiceDto,
    nullable: true,
    required: false,
    description:
      'Product lines only: the choice the line was priced with; null = AUTO, and always null without a cabinet token.',
  })
  promotion?: PromotionChoiceDto | null;

  @ApiProperty({
    type: String,
    format: 'decimal',
    nullable: true,
    required: false,
    example: '3.33333333',
    description:
      'Product lines only: the last purchase price per unit, 8 fractional digits; null without receipts, without Read(INVENTORY) or without a cabinet token.',
  })
  lastPurchaseUnitCost?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Product lines only: lineTotal below the last purchase price of the quantity (does not block the sale); false without a cabinet token.',
  })
  belowCost?: boolean;

  static fromLine(
    line: BookingPricingLine,
    cabinet = false,
  ): BookingPricingItemResponseDto {
    const {
      eligible,
      ineligible,
      discount,
      adjustments,
      promotion,
      lastPurchaseUnitCost,
      belowCost,
      staffId,
      staffName,
      staffSource,
      ...money
    } = line;
    return Object.assign(new BookingPricingItemResponseDto(), money, {
      discount:
        discount === null
          ? null
          : BookingPricingDiscountDto.fromAdjustment(discount, cabinet),
      ...(cabinet && {
        eligible: eligible.map(BookingPricingDiscountOptionDto.fromOption),
        ineligible: ineligible.map(BookingPricingPromotionSkipDto.fromSkip),
      }),
      ...(line.type === OrderItemType.PRODUCT && {
        adjustments: (adjustments ?? []).map(OrderPriceAdjustmentDto.fromLayer),
        promotion: promotion
          ? Object.assign(new PromotionChoiceDto(), {
              mode: promotion.mode,
              ruleId: promotion.ruleId ?? null,
            })
          : null,
        lastPurchaseUnitCost:
          lastPurchaseUnitCost == null
            ? null
            : UnitCostUtils.format(lastPurchaseUnitCost),
        belowCost: belowCost ?? false,
      }),
      staffId: staffId ?? null,
      staffName: staffName ?? null,
      staffSource: staffSource ?? null,
      quantity: QuantityUtils.format(line.quantity),
      listUnitPrice: MoneyUtils.format(line.listUnitPrice),
      listLineTotal: MoneyUtils.format(line.listLineTotal),
      customUnitPrice:
        line.customUnitPrice == null
          ? null
          : MoneyUtils.format(line.customUnitPrice),
      unitPrice: MoneyUtils.format(line.unitPrice),
      lineSubtotal: MoneyUtils.format(line.lineSubtotal),
      discountTotal: MoneyUtils.format(line.discountTotal),
      lineTotal: MoneyUtils.format(line.lineTotal),
    });
  }
}
