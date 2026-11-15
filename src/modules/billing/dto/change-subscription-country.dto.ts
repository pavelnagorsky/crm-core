import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { BillingReasonDto } from './billing-reason.dto.js';

export class ChangeSubscriptionCountryDto extends BillingReasonDto {
  @ApiProperty({
    example: 'BY',
    description:
      'Country of prices from the next payment; the open request keeps its snapshot',
  })
  @TrimString()
  @Matches(regularExpressions.countryCode)
  countryCode: string;
}
