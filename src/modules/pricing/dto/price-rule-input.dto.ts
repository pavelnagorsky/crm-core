import { ApiProperty } from '@nestjs/swagger';
import { PriceScheduleType, PriceValueType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsPositivePrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import {
  PRICE_RULE_MAX_HOLIDAY_DATES,
  PRICE_RULE_MAX_INTERVALS,
  PRICE_RULE_MAX_TARGETS,
  PRICE_RULE_NAME_MAX_LENGTH,
  PRICE_RULE_NOTE_MAX_LENGTH,
} from '../constants/price-rule.constants.js';
import { PriceRuleIntervalInputDto } from './price-rule-interval-input.dto.js';
import { PriceRuleTargetInputDto } from './price-rule-target-input.dto.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Full content of a surcharge rule (docs/pricing-stage3-api.md). Which fields a schedule type
 * allows is checked by the service: 400 PRICE_RULE_INVALID with the field.
 */
export class PriceRuleInputDto {
  @ApiProperty({
    enum: PriceScheduleType,
    enumName: 'PriceScheduleType',
    description:
      'WEEKLY: weekdays required, period optional. SEASON: visitFrom and visitTo required. HOLIDAYS: dates required.',
  })
  @IsEnum(PriceScheduleType)
  scheduleType: PriceScheduleType;

  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: PRICE_RULE_NAME_MAX_LENGTH,
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRICE_RULE_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: PRICE_RULE_NOTE_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(PRICE_RULE_NOTE_MAX_LENGTH)
  note?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'New rules are enabled by default; an update keeps the current value.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  @IsEnum(PriceValueType)
  valueType: PriceValueType;

  @IsPositivePrice(
    'Percent (up to 1000.00) or amount by valueType; greater than zero, 2 fractional digits.',
  )
  value: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '2026-12-01',
    description: 'First day of the period (local date).',
  })
  @IsOptional()
  @IsCalendarDate()
  visitFrom?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '2026-12-31',
    description: 'Last day of the period (local date).',
  })
  @IsOptional()
  @IsCalendarDate()
  visitTo?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'SEASON and HOLIDAYS: compare month and day only.',
  })
  @IsOptional()
  @IsBoolean()
  yearly?: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'HOLIDAYS: on its dates only holiday rules with this flag apply.',
  })
  @IsOptional()
  @IsBoolean()
  holidayExclusive?: boolean;

  @ApiProperty({
    type: Number,
    isArray: true,
    required: false,
    description:
      'ISO weekdays 1-7. Empty: every day (WEEKLY requires at least one).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  weekdays?: number[];

  @ApiProperty({
    type: () => PriceRuleIntervalInputDto,
    isArray: true,
    required: false,
    description: 'Visit start intervals; empty: the whole day.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRICE_RULE_MAX_INTERVALS)
  @ValidateNested({ each: true })
  @Type(() => PriceRuleIntervalInputDto)
  intervals?: PriceRuleIntervalInputDto[];

  @ApiProperty({
    type: String,
    isArray: true,
    required: false,
    example: ['2026-12-31'],
    description: 'HOLIDAYS: 1-100 local dates.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRICE_RULE_MAX_HOLIDAY_DATES)
  @IsString({ each: true })
  dates?: string[];

  @ApiProperty({
    type: Boolean,
    description:
      'true: applies to every service and bundle except the excluded targets. false: only to the listed targets.',
  })
  @IsBoolean()
  appliesToAll: boolean;

  @ApiProperty({
    type: () => PriceRuleTargetInputDto,
    isArray: true,
    required: false,
    description:
      'Services, categories and bundles of this location: the targets, or the exclusions when appliesToAll.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRICE_RULE_MAX_TARGETS)
  @ValidateNested({ each: true })
  @Type(() => PriceRuleTargetInputDto)
  targets?: PriceRuleTargetInputDto[];
}
