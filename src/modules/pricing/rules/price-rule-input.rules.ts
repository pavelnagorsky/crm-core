import { HttpStatus } from '@nestjs/common';
import {
  Prisma,
  PriceRuleKind,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import {
  PRICE_RULE_MAX_AMOUNT,
  PRICE_RULE_MAX_HOLIDAY_DATES,
  PRICE_RULE_MAX_INTERVALS,
  PRICE_RULE_MAX_PERCENT,
  PRICE_RULE_MAX_TARGETS,
  PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS,
  PROMOTION_MAX_LEAD_MINUTES,
  PROMOTION_MAX_PERCENT,
  PROMOTION_MAX_STAFF,
  PROMOTION_MAX_USAGE_LIMIT,
  PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH,
  PROMOTION_PUBLIC_NAME_MAX_LENGTH,
} from '../constants/price-rule.constants.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { NormalizedPriceRule } from '../interfaces/normalized-price-rule.interface.js';
import { NormalizedPromotion } from '../interfaces/normalized-promotion.interface.js';
import { PriceRuleIntervalMinutes } from '../interfaces/price-rule-interval-minutes.interface.js';
import { PriceRuleTargetRef } from '../interfaces/price-rule-target-ref.interface.js';

const MINUTES_PER_DAY = 1440;

/** Promotion fields; a surcharge input naming any of them is invalid. */
const PROMOTION_FIELDS = [
  'scenario',
  'publicName',
  'publicDescription',
  'showAsPromotion',
  'bookingFrom',
  'bookingTo',
  'minLeadMinutes',
  'maxLeadMinutes',
  'channels',
  'staffIds',
  'clientFilter',
  'birthdayWindowDays',
  'promoCode',
  'usageLimitTotal',
  'usageLimitPerClient',
  'usageLimitPeriod',
  'minVisitTotal',
] as const satisfies readonly (keyof PriceRuleInputDto)[];

const CHANNEL_ORDER: readonly PromotionChannel[] = [
  PromotionChannel.ONLINE,
  PromotionChannel.ADMIN,
];

/** 400 PRICE_RULE_INVALID; the payload names the field the client should mark. */
function invalid(field: string): never {
  throw new AppException(ErrorCode.PRICE_RULE_INVALID, HttpStatus.BAD_REQUEST, {
    field,
  });
}

/** True for a real calendar day written as YYYY-MM-DD. */
export function isCalendarDay(value: string): boolean {
  if (!regularExpressions.calendarDate.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function checkedDay(value: string | null | undefined, field: string): string {
  if (typeof value !== 'string' || !isCalendarDay(value)) invalid(field);
  return value;
}

/** A promo code as stored: trimmed, upper case; null when it is not a valid code. */
export function normalizePromoCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return regularExpressions.promoCode.test(code) ? code : null;
}

/** Bit (isoWeekday - 1) per day; 0 when no day is named. */
export function weekdaysToMask(weekdays: readonly number[]): number {
  return weekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

/** ISO weekdays 1-7 of a mask, ascending. */
export function maskToWeekdays(mask: number): number[] {
  const days: number[] = [];
  for (let day = 1; day <= 7; day += 1)
    if (mask & (1 << (day - 1))) days.push(day);
  return days;
}

function normalizeWeekdays(weekdays: readonly number[] | undefined): number {
  const days = weekdays ?? [];
  if (
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length
  )
    invalid('weekdays');
  return weekdaysToMask(days);
}

/** "HH:mm" to minutes; "24:00" is allowed as the end of the day. */
function timeToMinutes(value: string): number {
  if (value === '24:00') return MINUTES_PER_DAY;
  if (!regularExpressions.time.test(value)) invalid('intervals');
  return TimeUtils.hhmmToMinutes(value);
}

function normalizeIntervals(
  intervals: PriceRuleInputDto['intervals'],
): PriceRuleIntervalMinutes[] {
  const items = intervals ?? [];
  if (items.length > PRICE_RULE_MAX_INTERVALS) invalid('intervals');
  const result = items
    .map((item) => ({
      startMinute: timeToMinutes(item.start),
      endMinute: timeToMinutes(item.end),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
  result.forEach((item, index) => {
    if (item.startMinute >= item.endMinute) invalid('intervals');
    // Half-open intervals: one may start where the previous one ends.
    if (index > 0 && item.startMinute < result[index - 1].endMinute)
      invalid('intervals');
  });
  return result;
}

function positiveMoney(raw: string, max: string, field: string): string {
  let value: Prisma.Decimal;
  try {
    value = new Prisma.Decimal(raw);
  } catch {
    return invalid(field);
  }
  if (!value.isFinite() || value.lte(0) || value.decimalPlaces() > 2)
    invalid(field);
  if (value.gt(max)) invalid(field);
  return value.toFixed(2);
}

function normalizeValue(
  kind: PriceRuleKind,
  valueType: PriceValueType,
  raw: string,
): string {
  const max =
    valueType === PriceValueType.AMOUNT
      ? PRICE_RULE_MAX_AMOUNT
      : kind === PriceRuleKind.PROMOTION
        ? PROMOTION_MAX_PERCENT
        : PRICE_RULE_MAX_PERCENT;
  return positiveMoney(raw, max, 'value');
}

const PRODUCT_TARGET_TYPES: ReadonlySet<PriceRuleTargetType> = new Set([
  PriceRuleTargetType.PRODUCT,
  PriceRuleTargetType.PRODUCT_CATEGORY,
]);

/** A product or a product category target (the rest are service-kind targets). */
export function isProductTarget(type: PriceRuleTargetType): boolean {
  return PRODUCT_TARGET_TYPES.has(type);
}

/**
 * Targets by kind (docs/pricing-stage7-api.md): with "all services" the service-kind targets
 * are only exclusions, otherwise only inclusions; the same for products with "all products".
 * Something must be included: an "all" flag or an included target. A surcharge never has
 * product targets or "all products".
 */
function normalizeTargets(
  input: PriceRuleInputDto,
  kind: PriceRuleKind,
): PriceRuleTargetRef[] {
  const targets = (input.targets ?? []).map((target) => ({
    type: target.type as PriceRuleTargetType,
    id: target.id,
    excluded: target.excluded === true,
  }));
  if (targets.length > PRICE_RULE_MAX_TARGETS) invalid('targets');
  const keys = new Set(targets.map((target) => `${target.type}:${target.id}`));
  if (keys.size !== targets.length) invalid('targets');
  const allProducts = input.appliesToAllProducts === true;
  if (
    kind !== PriceRuleKind.PROMOTION &&
    (allProducts || targets.some((target) => isProductTarget(target.type)))
  )
    invalid('targets');
  for (const target of targets) {
    const all = isProductTarget(target.type)
      ? allProducts
      : input.appliesToAllServices;
    // Applies to all of a kind: that kind lists only exclusions; otherwise only inclusions.
    if (target.excluded !== all) invalid('targets');
  }
  if (
    !input.appliesToAllServices &&
    !allProducts &&
    !targets.some((target) => !target.excluded)
  )
    invalid('targets');
  return targets;
}

const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null;

function optionalInt(
  value: number | null | undefined,
  min: number,
  max: number,
  field: string,
): number | null {
  if (!isSet(value)) return null;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    invalid(field);
  return value as number;
}

/** Promotion fields of a PROMOTION input (docs/pricing-stage4-api.md). */
function normalizePromotion(input: PriceRuleInputDto): NormalizedPromotion {
  const publicName = input.publicName?.trim() ?? '';
  if (
    publicName.length === 0 ||
    publicName.length > PROMOTION_PUBLIC_NAME_MAX_LENGTH
  )
    invalid('publicName');
  const publicDescription = input.publicDescription?.trim() || null;
  if (
    publicDescription !== null &&
    publicDescription.length > PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH
  )
    invalid('publicDescription');

  const bookingFrom = isSet(input.bookingFrom)
    ? checkedDay(input.bookingFrom, 'bookingFrom')
    : null;
  const bookingTo = isSet(input.bookingTo)
    ? checkedDay(input.bookingTo, 'bookingTo')
    : null;
  if (bookingFrom && bookingTo && bookingFrom > bookingTo) invalid('bookingTo');

  const minLeadMinutes = optionalInt(
    input.minLeadMinutes,
    0,
    PROMOTION_MAX_LEAD_MINUTES,
    'minLeadMinutes',
  );
  const maxLeadMinutes = optionalInt(
    input.maxLeadMinutes,
    0,
    PROMOTION_MAX_LEAD_MINUTES,
    'maxLeadMinutes',
  );
  if (
    minLeadMinutes !== null &&
    maxLeadMinutes !== null &&
    minLeadMinutes > maxLeadMinutes
  )
    invalid('maxLeadMinutes');

  const channels = input.channels ?? [];
  if (
    channels.length === 0 ||
    new Set(channels).size !== channels.length ||
    channels.some((channel) => !CHANNEL_ORDER.includes(channel))
  )
    invalid('channels');

  const staffIds = [...new Set(input.staffIds ?? [])].sort();
  if (staffIds.length > PROMOTION_MAX_STAFF) invalid('staffIds');

  const clientFilter = input.clientFilter ?? PromotionClientFilter.ANY;
  const birthdayWindowDays = optionalInt(
    input.birthdayWindowDays,
    0,
    PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS,
    'birthdayWindowDays',
  );
  if ((clientFilter === PromotionClientFilter.BIRTHDAY) !== (birthdayWindowDays !== null))
    invalid('birthdayWindowDays');

  let promoCode: string | null = null;
  if (isSet(input.promoCode) && (input.promoCode as string).trim() !== '') {
    promoCode = normalizePromoCode(input.promoCode as string);
    if (promoCode === null) invalid('promoCode');
  }

  const usageLimitTotal = optionalInt(
    input.usageLimitTotal,
    1,
    PROMOTION_MAX_USAGE_LIMIT,
    'usageLimitTotal',
  );
  const usageLimitPerClient = optionalInt(
    input.usageLimitPerClient,
    1,
    PROMOTION_MAX_USAGE_LIMIT,
    'usageLimitPerClient',
  );
  const usageLimitPeriod = input.usageLimitPeriod ?? null;
  if ((usageLimitPerClient === null) !== (usageLimitPeriod === null))
    invalid(usageLimitPerClient === null ? 'usageLimitPerClient' : 'usageLimitPeriod');

  const minVisitTotal = isSet(input.minVisitTotal)
    ? positiveMoney(
        input.minVisitTotal as string,
        PRICE_RULE_MAX_AMOUNT,
        'minVisitTotal',
      )
    : null;

  return {
    scenario: input.scenario ?? null,
    publicName,
    publicDescription,
    showAsPromotion: input.showAsPromotion ?? true,
    bookingFrom,
    bookingTo,
    minLeadMinutes,
    maxLeadMinutes,
    channels: CHANNEL_ORDER.filter((channel) => channels.includes(channel)),
    staffIds,
    clientFilter,
    birthdayWindowDays,
    promoCode,
    usageLimitTotal,
    usageLimitPerClient,
    usageLimitPeriod,
    minVisitTotal,
  };
}

/**
 * Checks a rule input against its kind and schedule type and turns it into stored form
 * (docs/pricing-stage3-api.md, docs/pricing-stage4-api.md). Fields of another schedule type
 * or kind are rejected, not ignored. A promotion is WEEKLY; its weekdays may be empty (every
 * day). Throws 400 PRICE_RULE_INVALID with the offending field.
 */
export function normalizePriceRuleInput(
  input: PriceRuleInputDto,
): NormalizedPriceRule {
  const kind = input.kind ?? PriceRuleKind.SURCHARGE;
  const isPromotion = kind === PriceRuleKind.PROMOTION;
  if (!isPromotion)
    for (const field of PROMOTION_FIELDS)
      if (isSet(input[field])) invalid(field);
  if (isPromotion && input.scheduleType !== PriceScheduleType.WEEKLY)
    invalid('scheduleType');

  const name = input.name?.trim() ?? '';
  if (name.length === 0) invalid('name');
  const note = input.note?.trim() || null;
  const value = normalizeValue(kind, input.valueType, input.value);
  const yearly = input.yearly === true;
  const holidayExclusive = input.holidayExclusive === true;
  const dates = [...new Set(input.dates ?? [])];
  const hasDates = (input.dates ?? []).length > 0;
  const weekdaysMask = normalizeWeekdays(input.weekdays);
  const intervals = normalizeIntervals(input.intervals);
  const targets = normalizeTargets(input, kind);

  let visitFrom: string | null = null;
  let visitTo: string | null = null;

  switch (input.scheduleType) {
    case PriceScheduleType.WEEKLY:
      if (yearly) invalid('yearly');
      if (holidayExclusive) invalid('holidayExclusive');
      if (hasDates) invalid('dates');
      if (weekdaysMask === 0 && !isPromotion) invalid('weekdays');
      if (input.visitFrom) visitFrom = checkedDay(input.visitFrom, 'visitFrom');
      if (input.visitTo) visitTo = checkedDay(input.visitTo, 'visitTo');
      if (visitFrom && visitTo && visitFrom > visitTo) invalid('visitTo');
      break;
    case PriceScheduleType.SEASON:
      if (holidayExclusive) invalid('holidayExclusive');
      if (hasDates) invalid('dates');
      visitFrom = checkedDay(input.visitFrom, 'visitFrom');
      visitTo = checkedDay(input.visitTo, 'visitTo');
      // A yearly season compares month and day and may cross the new year.
      if (!yearly && visitFrom > visitTo) invalid('visitTo');
      break;
    case PriceScheduleType.HOLIDAYS:
      if (input.visitFrom) invalid('visitFrom');
      if (input.visitTo) invalid('visitTo');
      if (
        dates.length === 0 ||
        dates.length > PRICE_RULE_MAX_HOLIDAY_DATES ||
        dates.some((date) => !isCalendarDay(date))
      )
        invalid('dates');
      dates.sort();
      break;
    default:
      invalid('scheduleType');
  }

  return {
    kind,
    scheduleType: input.scheduleType,
    name,
    note,
    enabled: input.enabled ?? null,
    valueType: input.valueType,
    value,
    visitFrom,
    visitTo,
    yearly,
    holidayExclusive,
    weekdaysMask,
    intervals,
    dates: input.scheduleType === PriceScheduleType.HOLIDAYS ? dates : [],
    appliesToAllServices: input.appliesToAllServices,
    appliesToAllProducts: isPromotion && input.appliesToAllProducts === true,
    targets,
    promotion: isPromotion ? normalizePromotion(input) : null,
  };
}
