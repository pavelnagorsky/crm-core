import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { IsEnum, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class PaymentQuoteRequestDto {
  @ApiProperty({ example: 'team', maxLength: 50 })
  @TrimString()
  @Matches(regularExpressions.billingPlanCode)
  @MaxLength(50)
  planCode: string;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;
}
