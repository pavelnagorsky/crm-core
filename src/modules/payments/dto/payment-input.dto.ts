import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsClientPaymentKey } from '../decorators/is-client-payment-key.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentDetailsDto } from './payment-details.dto.js';

/** A payment with its own idempotency key. */
export class PaymentInputDto extends PaymentDetailsDto {
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
