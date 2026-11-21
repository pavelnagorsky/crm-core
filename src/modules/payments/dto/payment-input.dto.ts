import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsOptionalPositivePrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsClientPaymentKey } from '../decorators/is-client-payment-key.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentDetailsDto } from './payment-details.dto.js';

/** A payment with its own idempotency key. */
export class PaymentInputDto extends PaymentDetailsDto {
  @IsOptionalPositivePrice(
    'One-click payment: the amount the person saw, > 0. CASH or CARD only (with MIXED: 400 PAYMENT_SPLIT_INVALID). When it differs from what the payment must cover (amount due plus active refunds): 409 PAYMENT_AMOUNT_MISMATCH with responseValue { amountDue, requiredAmount }, nothing is written. Part of the request hash.',
  )
  expectedAmount?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'One-click payment: true when the order was shown without a payment. An active payment already exists: 409 PAYMENT_ALREADY_RECORDED with responseValue { operationId }, nothing is written. Part of the request hash; a retry with the same key returns the first result before this check.',
  })
  @IsOptional()
  @IsBoolean()
  expectNoPayment?: boolean;

  @ApiProperty({
    type: String,
    maxLength: 100,
    description:
      'New key per payment action, reused for retries. A retry with the same key and request returns the first result without effects; a different request with the key: 409 PAYMENT_IDEMPOTENCY_CONFLICT with responseValue { operationId }. Cannot start with order-sale:, order-confirm: or order-return: (400).',
  })
  @IsString()
  @TrimString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsClientPaymentKey()
  idempotencyKey: string;
}
