import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentQuoteRequestDto } from './payment-quote-request.dto.js';

/** Request for renewal (plan section 4.2). */
export class CreateSubscriptionPaymentDto extends PaymentQuoteRequestDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    description:
      'Owner comment for the platform, e.g. preferred payment method',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
