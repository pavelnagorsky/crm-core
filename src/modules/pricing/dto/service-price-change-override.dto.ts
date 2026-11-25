import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';

/** A manual edit of the new price of one row. */
export class ServicePriceChangeOverrideDto {
  @ApiProperty({ type: String, description: 'Row key from the preview.' })
  @IsString()
  @MaxLength(120)
  key: string;

  @ApiPrice({
    required: true,
    nullable: true,
    description: 'New price; null only for a level or personal price: remove it.',
  })
  @ValidateIf((_, value) => value !== null)
  @CanonicalAmount()
  @Matches(regularExpressions.moneyAmount)
  price: string | null;
}
