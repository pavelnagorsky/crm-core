import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { OrderProductItemDto } from './order-product-item.dto.js';

export class UpdateOrderItemDto extends OrderProductItemDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Existing draft order item id. Omit to create a new draft item.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;
}
