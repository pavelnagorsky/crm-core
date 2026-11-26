import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';

export class OrderReturnPreviewItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  orderItemId: string;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiPrice()
  lineSubtotal: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice({ description: 'Share of the actual line total for this quantity' })
  lineTotal: string;
}
