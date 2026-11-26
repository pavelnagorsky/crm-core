import { ApiProperty } from '@nestjs/swagger';
import {
  PriceRuleKind,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
  PromotionScenario,
} from '@prisma/client';
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
  IsUUID,
  Max,
  MaxLength,
  Min,
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
  PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS,
  PROMOTION_MAX_LEAD_MINUTES,
  PROMOTION_MAX_STAFF,
  PROMOTION_MAX_USAGE_LIMIT,
  PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH,
  PROMOTION_PUBLIC_NAME_MAX_LENGTH,
} from '../constants/price-rule.constants.js';
import { PriceRuleIntervalInputDto } from './price-rule-interval-input.dto.js';
import { PriceRuleTargetInputDto } from './price-rule-target-input.dto.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Full content of a surcharge or a promotion (docs/pricing-stage3-api.md,
 * docs/pricing-stage4-api.md). Which fields a kind and a schedule type allow is checked by
 * the service: 400 PRICE_RULE_INVALID with the field. A promotion is always WEEKLY.
 */
export class PriceRuleInputDto {
  @ApiProperty({
    enum: PriceRuleKind,
    enumName: 'PriceRuleKind',
    required: false,
    default: PriceRuleKind.SURCHARGE,
    description: 'Cannot change on update.',
  })
  @IsOptional()
  @IsEnum(PriceRuleKind)
  kind?: PriceRuleKind;

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
    'Percent (up to 1000.00, a promotion up to 100.00) or amount by valueType; greater than zero, 2 fractional digits.',
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
      'ISO weekdays 1-7. Empty: every day (a WEEKLY surcharge requires at least one; a promotion may leave it empty).',
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
  appliesToAllServices: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Promotion only. true: applies to every product except the excluded product targets. A surcharge with true is 400.',
  })
  @IsOptional()
  @IsBoolean()
  appliesToAllProducts?: boolean;

  @ApiProperty({
    type: () => PriceRuleTargetInputDto,
    isArray: true,
    required: false,
    description:
      'Services, categories and bundles of this location, products and product categories of its brand (promotions only): the targets, or the exclusions of the kind whose "all" flag is set.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRICE_RULE_MAX_TARGETS)
  @ValidateNested({ each: true })
  @Type(() => PriceRuleTargetInputDto)
  targets?: PriceRuleTargetInputDto[];
  // Promotion only (kind = PROMOTION); a surcharge with any of them is 400.

  @ApiProperty({
    enum: PromotionScenario,
    enumName: 'PromotionScenario',
    required: false,
    nullable: true,
    description: 'Template the promotion was created from: list icon and label only.',
  })
  @IsOptional()
  @IsEnum(PromotionScenario)
  scenario?: PromotionScenario | null;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: PROMOTION_PUBLIC_NAME_MAX_LENGTH,
    description: 'Name clients see; required for a promotion.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(PROMOTION_PUBLIC_NAME_MAX_LENGTH)
  publicName?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH)
  publicDescription?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: true,
    description: 'false: clients see a lower price without the old price and a label.',
  })
  @IsOptional()
  @IsBoolean()
  showAsPromotion?: boolean;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '2026-11-01',
    description: 'Booking period start: the location today at the moment of booking.',
  })
  @IsOptional()
  @IsCalendarDate()
  bookingFrom?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, example: '2026-11-30' })
  @IsOptional()
  @IsCalendarDate()
  bookingTo?: string | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: 'Book no later than this many minutes before the visit (in advance).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PROMOTION_MAX_LEAD_MINUTES)
  minLeadMinutes?: number | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: 'Book no earlier than this many minutes before the visit (last-minute).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PROMOTION_MAX_LEAD_MINUTES)
  maxLeadMinutes?: number | null;

  @ApiProperty({
    enum: PromotionChannel,
    enumName: 'PromotionChannel',
    isArray: true,
    required: false,
    description: 'ONLINE: booking page and widget; ADMIN: manual bookings. Not empty for a promotion.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsEnum(PromotionChannel, { each: true })
  channels?: PromotionChannel[];

  @ApiProperty({
    type: String,
    isArray: true,
    required: false,
    description: 'Active staff of the location; empty: every staff member.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROMOTION_MAX_STAFF)
  @IsUUID('all', { each: true })
  staffIds?: string[];

  @ApiProperty({
    enum: PromotionClientFilter,
    enumName: 'PromotionClientFilter',
    required: false,
    default: PromotionClientFilter.ANY,
  })
  @IsOptional()
  @IsEnum(PromotionClientFilter)
  clientFilter?: PromotionClientFilter;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    minimum: 0,
    maximum: PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS,
    description: 'BIRTHDAY only (then required): days before and after the birthday.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS)
  birthdayWindowDays?: number | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: 'AUTUMN-15',
    description: '3-32 of A-Z, 0-9, hyphen, underscore; stored upper case; unique among live promotions.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(32)
  promoCode?: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PROMOTION_MAX_USAGE_LIMIT)
  usageLimitTotal?: number | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    minimum: 1,
    description: 'Times per client within usageLimitPeriod (then required).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PROMOTION_MAX_USAGE_LIMIT)
  usageLimitPerClient?: number | null;

  @ApiProperty({
    enum: PromotionLimitPeriod,
    enumName: 'PromotionLimitPeriod',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(PromotionLimitPeriod)
  usageLimitPeriod?: PromotionLimitPeriod | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: '40.00',
    description: 'Visit total by the price list must be at least this.',
  })
  @IsOptional()
  @IsString()
  minVisitTotal?: string | null;
}
