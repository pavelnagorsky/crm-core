import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';

/** A payment nested in an order operation that has its own idempotency key. */
export class PaymentDetailsDto {
  @ApiProperty({
    enum: PaymentInputMethod,
    enumName: 'PaymentInputMethod',
    description:
      'CASH or CARD: one record for the whole amount due, no amounts in the request. MIXED: a cash and a card record, both amounts required.',
  })
  @IsEnum(PaymentInputMethod)
  method: PaymentInputMethod;

  @IsOptionalPrice(
    'MIXED only, > 0. cashAmount + cardAmount must equal the amount due (plus active refunds), otherwise 409 PAYMENT_AMOUNT_MISMATCH with responseValue { amountDue, requiredAmount }. Set with CASH or CARD, or not positive: 400 PAYMENT_SPLIT_INVALID.',
  )
  cashAmount?: string | null;

  @IsOptionalPrice('MIXED only, > 0. See cashAmount.')
  cardAmount?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '2026-11-19T18:30:00',
    description:
      'When the money changed hands: local datetime of the location without offset. Not later than now + 5 minutes and not older than 366 days (400 PAYMENT_DATE_INVALID). Omitted: a visit of a past day takes its start, a sale of a past day its date, a replacement the date of the replaced payment, otherwise now.',
  })
  @IsOptional()
  @IsLocalDateTime()
  occurredAt?: string | null;
}
