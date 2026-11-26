import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';

/** A manual new retail price of one product row. */
export class ProductPriceChangeOverrideDto {
  @ApiProperty({ type: String, description: 'Row key from the preview: PRODUCT:<productId>.' })
  @IsString()
  @MaxLength(120)
  key: string;

  @ApiPrice({ required: true, description: 'New retail price.' })
  @CanonicalAmount()
  @Matches(regularExpressions.moneyAmount)
  price: string;
}
