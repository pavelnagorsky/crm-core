import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { PromotionReportProduct } from '../interfaces/promotion-report-product.interface.js';

/** One product of a promotion report, net of returns. */
export class PromotionReportProductDto {
  @ApiProperty({ type: String })
  productId: string;

  @ApiProperty({ type: String, description: 'Title stored on the sale lines.' })
  title: string;

  @ApiProperty({ type: String, example: '3.000', description: 'Sold minus returned.' })
  quantity: string;

  @ApiPrice({ description: 'Line totals minus returns.' })
  revenue: string;

  @ApiPrice({ description: 'Discount on the lines minus the discount of returns.' })
  discount: string;

  static fromProduct(product: PromotionReportProduct): PromotionReportProductDto {
    const dto = new PromotionReportProductDto();
    dto.productId = product.productId;
    dto.title = product.title;
    dto.quantity = QuantityUtils.format(product.quantity);
    dto.revenue = MoneyUtils.format(product.revenue);
    dto.discount = MoneyUtils.format(product.discount);
    return dto;
  }
}
