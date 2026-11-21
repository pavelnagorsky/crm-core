import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentSummaryDto } from '../../payments/dto/payment-summary.dto.js';
import { OrderPaymentTotals } from '../../payments/interfaces/order-payment-totals.interface.js';
import { OrderStatus } from '../enums/order-status.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { orderAmountDue } from '../rules/order-payment-due.rules.js';
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

  @ApiProperty({ type: Number })
  version: number;

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

  @ApiProperty({
    type: () => PaymentSummaryDto,
    description:
      'Payment of the order. amountDue counts the confirmed lines of the order minus returns (0 for a voided order). For a visit order before completion the booking services are not in the order yet: the booking card (GET bookings/:id, payment) holds the authoritative amount of a visit. NOT_TRACKED: a sale (by occurredAt) or a visit order (by the visit startAt) out of payment tracking of the location.',
  })
  payment: PaymentSummaryDto;

  static fromEntity(
    entity: OrderWithItems,
    payment: OrderPaymentTotals | null | undefined,
    tracked: boolean,
  ): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = entity.id;
    dto.locationId = entity.locationId;
    dto.bookingId = entity.bookingId;
    dto.clientId = entity.clientId;
    dto.clientName = entity.clientName;
    dto.clientPhone = entity.clientPhone;
    dto.currency = entity.currency;
    dto.status = entity.status;
    dto.version = entity.version;
    dto.occurredAt = entity.occurredAt;
    dto.listTotalAmount = MoneyUtils.format(entity.listTotalAmount);
    dto.subtotalAmount = MoneyUtils.format(entity.subtotalAmount);
    dto.discountTotal = MoneyUtils.format(entity.discountTotal);
    dto.totalAmount = MoneyUtils.format(entity.totalAmount);
    dto.note = entity.note;
    dto.createdByName = entity.createdByName;
    dto.voidedAt = entity.voidedAt;
    dto.voidReason = entity.voidReason;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.items = entity.items.map(OrderItemResponseDto.fromEntity);
    dto.payment = PaymentSummaryDto.from(
      orderAmountDue(entity),
      payment,
      tracked,
    );
    return dto;
  }
}
