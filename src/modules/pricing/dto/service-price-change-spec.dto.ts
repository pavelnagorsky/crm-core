import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsUUID,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { PRICE_ROUNDING_STEPS } from '../constants/price-rounding-steps.constants.js';
import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { ServicePriceChangeIncludeDto } from './service-price-change-include.dto.js';

const MAX_SCOPE_IDS = 5000;

/** The rule of a price change: what it touches, how, and from when. */
export class ServicePriceChangeSpecDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Every service and FIXED bundle of the location; the lists below are ignored.',
  })
  @IsBoolean()
  allServices: boolean;

  @ApiProperty({ type: String, isArray: true, format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsUUID(undefined, { each: true })
  serviceIds: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'Services of the category and its FIXED bundles.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsUUID(undefined, { each: true })
  categoryIds: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'FIXED bundles only.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_IDS)
  @IsUUID(undefined, { each: true })
  bundleIds: string[];

  @ApiProperty({
    enum: ServicePriceChangeMode,
    enumName: 'ServicePriceChangeMode',
  })
  @IsEnum(ServicePriceChangeMode)
  mode: ServicePriceChangeMode;

  @ApiSignedAmount({
    required: true,
    nullable: true,
    description:
      'PERCENT: -99.00..1000.00; AMOUNT: signed amount; SET: new price (>= 0) or null.',
  })
  @ValidateIf((_, value) => value !== null)
  @CanonicalAmount()
  @Matches(regularExpressions.signedAmount)
  value: string | null;

  @ApiProperty({
    type: String,
    enum: PRICE_ROUNDING_STEPS,
    example: '1.00',
    description: 'Step the new prices round to (nearest); 0.01 means no rounding.',
  })
  @CanonicalAmount()
  @IsIn(PRICE_ROUNDING_STEPS)
  priceRoundingStep: string;

  @ApiProperty({ type: () => ServicePriceChangeIncludeDto })
  @ValidateNested()
  @Type(() => ServicePriceChangeIncludeDto)
  include: ServicePriceChangeIncludeDto;

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
