import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromoCodeResultDto } from '../../pricing/dto/promo-code-result.dto.js';
import { OrderPricingContext } from '../enums/order-pricing-context.enum.js';
import { OrderPricingPreview } from '../interfaces/order-pricing-preview.interface.js';
import { ProductPricingLineDto } from './product-pricing-line.dto.js';

export class OrderPricingResponseDto {
  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: OrderPricingContext, enumName: 'OrderPricingContext' })
  context: OrderPricingContext;

  @ApiProperty({ type: () => ProductPricingLineDto, isArray: true })
  items: ProductPricingLineDto[];

  @ApiPrice()
  listTotalAmount: string;

  @ApiPrice()
  subtotalAmount: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice({
    description:
      'Sum of lineTotal: expectedTotal of selling the whole set; for part of the lines send the sum of their lineTotal.',
  })
  totalAmount: string;

  @ApiProperty({
    type: () => PromoCodeResultDto,
    nullable: true,
    description: 'What the promo code did on these lines; null without a code.',
  })
  promoCode: PromoCodeResultDto | null;

  static fromPreview(preview: OrderPricingPreview): OrderPricingResponseDto {
    return Object.assign(new OrderPricingResponseDto(), {
      currency: preview.currency,
      context: preview.context,
      items: preview.lines.map(ProductPricingLineDto.fromView),
      listTotalAmount: MoneyUtils.format(preview.listTotalAmount),
      subtotalAmount: MoneyUtils.format(preview.subtotalAmount),
      discountTotal: MoneyUtils.format(preview.discountTotal),
      totalAmount: MoneyUtils.format(preview.totalAmount),
      promoCode: PromoCodeResultDto.fromResult(preview.promoCode),
    });
  }
}
