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
      'Promotion or client discount of a service line (lineTotal includes it); null for products and lines without one.',
  })
  discount: BookingPricingDiscountDto | null;

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

  static fromLine(
    line: BookingPricingLine,
    cabinet = false,
  ): BookingPricingItemResponseDto {
    const { eligible, ineligible, discount, ...money } = line;
    return Object.assign(new BookingPricingItemResponseDto(), money, {
      discount:
        discount === null
          ? null
          : BookingPricingDiscountDto.fromAdjustment(discount, cabinet),
      ...(cabinet && {
        eligible: eligible.map(BookingPricingDiscountOptionDto.fromOption),
        ineligible: ineligible.map(BookingPricingPromotionSkipDto.fromSkip),
      }),
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
