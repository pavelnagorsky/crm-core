import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsPositivePrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { IsClientPaymentKey } from '../decorators/is-client-payment-key.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';

export class RefundInputDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsPositivePrice(
    'Greater than 0 and not greater than what this method brought in net of its refunds, nor the paid amount (409 PAYMENT_REFUND_EXCEEDS_PAID with responseValue { paidAmount, method }).',
  )
  amount: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '2026-11-20T10:00:00',
    description:
      'Local datetime of the location without offset; omitted: now. Same limits as a payment date (400 PAYMENT_DATE_INVALID).',
  })
  @IsOptional()
  @IsLocalDateTime()
  occurredAt?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 500,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(500)
  reason?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 100,
    description:
      'New key per refund, reused for retries. A different request with the key: 409 PAYMENT_IDEMPOTENCY_CONFLICT. Cannot start with order-sale:, order-confirm: or order-return: (400).',
  })
  @IsString()
  @TrimString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsClientPaymentKey()
  idempotencyKey: string;
}
