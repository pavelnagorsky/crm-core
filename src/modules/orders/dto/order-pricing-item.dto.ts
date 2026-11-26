import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { OrderProductItemDto } from './order-product-item.dto.js';

/** A draft product line of the desired set (as in PUT orders/:orderId). */
export class OrderPricingItemDto extends OrderProductItemDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Draft line of the order: its stored custom price and discount choice apply unless sent.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;
}
