import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { OrderReturnPreview } from '../interfaces/order-return-preview.interface.js';
import { OrderReturnPreviewItemDto } from './order-return-preview-item.dto.js';

export class OrderReturnPreviewDto {
  @ApiProperty({ type: () => OrderReturnPreviewItemDto, isArray: true })
  items: OrderReturnPreviewItemDto[];

  @ApiPrice({ description: 'Σ lineTotal: "К возврату"' })
  totalAmount: string;

  @ApiPrice({
    description:
      'Money the return gives back (refund rule of a return); "0.00" - no refund method is needed',
  })
  refundAmount: string;

  static fromPreview(preview: OrderReturnPreview): OrderReturnPreviewDto {
    const dto = new OrderReturnPreviewDto();
    dto.items = preview.items.map((item) =>
      Object.assign(new OrderReturnPreviewItemDto(), {
        orderItemId: item.orderItemId,
        quantity: QuantityUtils.format(item.quantity),
        lineSubtotal: MoneyUtils.format(item.lineSubtotal),
        discountTotal: MoneyUtils.format(item.discountTotal),
        lineTotal: MoneyUtils.format(item.lineTotal),
      }),
    );
    dto.totalAmount = MoneyUtils.format(preview.totalAmount);
    dto.refundAmount = MoneyUtils.format(preview.refundAmount);
    return dto;
  }
}
