import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { BillingReasonDto } from './billing-reason.dto.js';

/**
 * Admin plan assignment and custom terms. An omitted field keeps the current
 * value, null clears it.
 */
export class AssignSubscriptionPlanDto extends BillingReasonDto {
  @ApiProperty({ example: 'network', maxLength: 50 })
  @TrimString()
  @Matches(regularExpressions.billingPlanCode)
  @MaxLength(50)
  planCode: string;

  @ApiPropertyOptional({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description:
      'Overrides the plan staff limit; null returns to the plan limit',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  customStaffLimit?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description:
      'Overrides the plan location limit; null returns to the plan limit',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  customLocationLimit?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'BYN',
    description: 'Currency of the custom prices; default: the pricing country',
  })
  @TrimString()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Matches(regularExpressions.currencyCode)
  customCurrency?: string | null;

  @ApiPrice({
    required: false,
    nullable: true,
    description: 'Monthly price of a CUSTOM plan for this brand',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @CanonicalAmount()
  @Matches(regularExpressions.moneyAmount)
  customMonthlyPrice?: string | null;

  @ApiPrice({
    required: false,
    nullable: true,
    description: 'Yearly price of a CUSTOM plan for this brand',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @CanonicalAmount()
  @Matches(regularExpressions.moneyAmount)
  customYearlyPrice?: string | null;

  @ApiProperty({
    description:
      'Convert the paid remainder into days of the new plan by daily prices (plan section 4.4); false keeps paidUntil',
  })
  @IsBoolean()
  convertRemaining: boolean;
}
