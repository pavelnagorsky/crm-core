import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ApiUnitCost } from '../../../shared/decorators/api-unit-cost.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { UnitCostUtils } from '../../../shared/money/unit-cost.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { BookingPricingDiscountOptionDto } from '../../bookings/dto/booking-pricing-discount-option.dto.js';
import { BookingPricingDiscountDto } from '../../bookings/dto/booking-pricing-discount.dto.js';
import { BookingPricingPromotionSkipDto } from '../../bookings/dto/booking-pricing-promotion-skip.dto.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';
import { ProductPricingLineView } from '../interfaces/product-pricing-line-view.interface.js';
import { OrderPriceAdjustmentDto } from './order-price-adjustment.dto.js';

/** A priced product line of a preview (docs/pricing-stage7-api.md). */
export class ProductPricingLineDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  orderItemId: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  productId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  productLocationId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit: ProductUnit;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sellerStaffId: string | null;

  @ApiPrice({ description: 'Retail price of the date' })
  baseUnitPrice: string;

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

  @ApiProperty({ type: () => OrderPriceAdjustmentDto, isArray: true })
  adjustments: OrderPriceAdjustmentDto[];

  @ApiProperty({ type: () => BookingPricingDiscountDto, nullable: true })
  discount: BookingPricingDiscountDto | null;

  @ApiProperty({
    type: () => BookingPricingDiscountOptionDto,
    isArray: true,
    description:
      'Discounts that apply, best first; chargedPrice is the line total with it.',
  })
  eligible: BookingPricingDiscountOptionDto[];

  @ApiProperty({ type: () => BookingPricingPromotionSkipDto, isArray: true })
  ineligible: BookingPricingPromotionSkipDto[];

  @ApiProperty({
    type: () => PromotionChoiceDto,
    nullable: true,
    description: 'The choice the line was priced with; null = AUTO.',
  })
  promotion: PromotionChoiceDto | null;

  @ApiUnitCost(true)
  lastPurchaseUnitCost: string | null;

  @ApiProperty({
    type: Boolean,
    description:
      'lineTotal below the last purchase price of the quantity; does not block the sale.',
  })
  belowCost: boolean;

  static fromView(view: ProductPricingLineView): ProductPricingLineDto {
    const { price } = view;
    return Object.assign(new ProductPricingLineDto(), {
      orderItemId: view.orderItemId,
      productId: view.productId,
      productLocationId: view.productLocationId,
      title: view.title,
      sku: view.sku,
      unit: view.unit,
      quantity: QuantityUtils.format(view.quantity),
      sellerStaffId: view.sellerStaffId,
      baseUnitPrice: MoneyUtils.format(price.baseUnitPrice),
      listUnitPrice: MoneyUtils.format(price.listUnitPrice),
      listLineTotal: MoneyUtils.format(price.listLineTotal),
      customUnitPrice:
        price.customUnitPrice === null
          ? null
          : MoneyUtils.format(price.customUnitPrice),
      unitPrice: MoneyUtils.format(price.unitPrice),
      lineSubtotal: MoneyUtils.format(price.lineSubtotal),
      discountTotal: MoneyUtils.format(price.discountTotal),
      lineTotal: MoneyUtils.format(price.lineTotal),
      adjustments: price.adjustments.map(OrderPriceAdjustmentDto.fromLayer),
      discount:
        price.discount === null
          ? null
          : BookingPricingDiscountDto.fromAdjustment(price.discount, true),
      eligible: price.eligible.map(BookingPricingDiscountOptionDto.fromOption),
      ineligible: price.ineligible.map(BookingPricingPromotionSkipDto.fromSkip),
      promotion: view.promotion
        ? Object.assign(new PromotionChoiceDto(), {
            mode: view.promotion.mode,
            ruleId: view.promotion.ruleId ?? null,
          })
        : null,
      lastPurchaseUnitCost:
        view.lastPurchaseUnitCost === null
          ? null
          : UnitCostUtils.format(view.lastPurchaseUnitCost),
      belowCost: view.belowCost,
    });
  }
}
