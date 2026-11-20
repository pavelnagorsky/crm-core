import { ApiProperty } from '@nestjs/swagger';
import { PaymentOperationWithPayments } from '../interfaces/payment-operation-with-payments.interface.js';
import { PaymentPartDto } from './payment-part.dto.js';

/** One active payment or refund: its active records. */
export class PaymentOperationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  operationId: string;

  @ApiProperty({ type: Date, description: 'When the money changed hands.' })
  occurredAt: Date;

  @ApiProperty({ type: String })
  createdByName: string;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Product return the refund is part of. Null for payments.',
  })
  orderReturnId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Refund reason. Null for payments.',
  })
  reason: string | null;

  @ApiProperty({
    type: () => PaymentPartDto,
    isArray: true,
    description: 'Cash first, then card.',
  })
  parts: PaymentPartDto[];

  static fromEntity(
    operation: PaymentOperationWithPayments,
  ): PaymentOperationDto {
    const dto = new PaymentOperationDto();
    dto.operationId = operation.id;
    dto.occurredAt = operation.payments[0]?.occurredAt ?? operation.createdAt;
    dto.createdByName = operation.createdByName;
    dto.createdAt = operation.createdAt;
    dto.orderReturnId = operation.orderReturnId;
    dto.reason = operation.reason;
    dto.parts = [...operation.payments]
      .sort((left, right) => left.method.localeCompare(right.method))
      .map(PaymentPartDto.fromEntity);
    return dto;
  }
}
