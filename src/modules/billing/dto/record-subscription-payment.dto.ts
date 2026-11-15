import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod, SubscriptionPaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

/** «Зачесть оплату»: a payment without a request, applied at once. */
export class RecordSubscriptionPaymentDto {
  @ApiProperty({ example: 'team', maxLength: 50 })
  @TrimString()
  @Matches(regularExpressions.billingPlanCode)
  @MaxLength(50)
  planCode: string;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @IsPrice()
  amount: string;

  @ApiProperty({ example: 'BYN' })
  @TrimString()
  @Matches(regularExpressions.currencyCode)
  currency: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the money was paid; not in the future',
  })
  @IsDateString()
  paidAt: string;

  @ApiProperty({
    enum: SubscriptionPaymentMethod,
    enumName: 'SubscriptionPaymentMethod',
  })
  @IsEnum(SubscriptionPaymentMethod)
  method: SubscriptionPaymentMethod;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Bank or ERIP reference',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
