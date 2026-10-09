import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../enums/order-status.enum.js';

export class OrderStatusCountResponseDto {
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiProperty({ type: Number })
  count: number;
}
