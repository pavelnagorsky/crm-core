import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class BillingPlanPricesRequestDto {
  @ApiPropertyOptional({ example: 'BY' })
  @TrimString()
  @IsOptional()
  @Matches(regularExpressions.countryCode)
  countryCode?: string;
}
