import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { OrderItemResponseDto } from './order-item-response.dto.js';

export class OrderResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  locationId: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bookingId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId: string | null;

  @ApiProperty({ type: String, nullable: true })
  clientName: string | null;

  @ApiProperty({ type: String, nullable: true })
  clientPhone: string | null;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;

  @ApiProperty({ type: Date })
  occurredAt: Date;

  @ApiPrice()
  listTotalAmount: string;

  @ApiPrice()
  subtotalAmount: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice()
  totalAmount: string;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: String })
  createdByName: string;

  @ApiProperty({ type: Date, nullable: true })
  voidedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  voidReason: string | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  @ApiProperty({ type: () => OrderItemResponseDto, isArray: true })
  items: OrderItemResponseDto[];

  static fromEntity(entity: OrderWithItems): OrderResponseDto {
    return Object.assign(new OrderResponseDto(), entity, {
      listTotalAmount: MoneyService.format(entity.listTotalAmount),
      subtotalAmount: MoneyService.format(entity.subtotalAmount),
      discountTotal: MoneyService.format(entity.discountTotal),
      totalAmount: MoneyService.format(entity.totalAmount),
      items: entity.items.map(OrderItemResponseDto.fromEntity),
    });
  }
}
