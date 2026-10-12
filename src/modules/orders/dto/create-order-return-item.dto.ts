import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsQuantity } from '../../../shared/decorators/is-quantity.decorator.js';

export class CreateOrderReturnItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  orderItemId: string;

  @IsQuantity()
  quantity: string;
}
