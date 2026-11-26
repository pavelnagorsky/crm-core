import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { PRICE_ROUNDING_STEPS } from '../constants/price-rounding-steps.constants.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';

const MAX_SCOPE_IDS = 5000;

/** The rule of a product price change: which products, how, and from when. */
export class ProductPriceChangeSpecDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Every product the location sells (retail price set, for sale); the lists below are ignored.',
  })
  @IsBoolean()
  allProducts: boolean;

  @ApiProperty({ type: String, isArray: true, format: 'uuid', description: 'Product.id' })
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsUUID(undefined, { each: true })
  productIds: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'ProductCategory.id: the products of the category.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsUUID(undefined, { each: true })
  categoryIds: string[];

  @ApiProperty({ enum: PriceChangeMode, enumName: 'PriceChangeMode' })
  @IsEnum(PriceChangeMode)
  mode: PriceChangeMode;

  @ApiSignedAmount({
    required: true,
    nullable: true,
    description:
      'PERCENT: -99.00..1000.00; AMOUNT: signed amount; SET: new price (>= 0) for every product, null keeps them.',
  })
  @ValidateIf((_, value) => value !== null)
  @CanonicalAmount()
  @Matches(regularExpressions.signedAmount)
  value: string | null;

  @ApiProperty({
    type: String,
    enum: PRICE_ROUNDING_STEPS,
    example: '1.00',
    description: 'Step PERCENT and AMOUNT prices round to (nearest); 0.01 means no rounding.',
  })
  @CanonicalAmount()
  @IsIn(PRICE_ROUNDING_STEPS)
  priceRoundingStep: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2027-01-01',
    description:
      'Local date the prices apply from, after today and within two years; null: now.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  effectiveDate: string | null;
}
