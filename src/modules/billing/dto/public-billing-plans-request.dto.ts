import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class PublicBillingPlansRequestDto {
  @ApiPropertyOptional({
    example: 'BY',
    description:
      'ISO 3166-1 alpha-2, upper case. Default: the platform default country. A country without its own prices gets the default prices',
  })
  @TrimString()
  @IsOptional()
  @Matches(regularExpressions.countryCode)
  country?: string;
}
