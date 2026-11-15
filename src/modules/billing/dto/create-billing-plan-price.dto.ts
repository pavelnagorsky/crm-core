import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CreateBillingPlanPriceDto {
  @ApiProperty({ example: 'BY' })
  @TrimString()
  @Matches(regularExpressions.countryCode)
  countryCode: string;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @IsPrice()
  amount: string;

  @ApiPropertyOptional({
    example: 'BYN',
    description:
      'Must match the currency of the country: its existing prices, else the country default',
  })
  @TrimString()
  @IsOptional()
  @Matches(regularExpressions.currencyCode)
  currency?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      'When the version starts to apply; now by default, never in the past',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
