import { HttpStatus } from '@nestjs/common';
import {
  Prisma,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
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
} from '../constants/price-rule.constants.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { NormalizedPriceRule } from '../interfaces/normalized-price-rule.interface.js';
import { PriceRuleIntervalMinutes } from '../interfaces/price-rule-interval-minutes.interface.js';
import { PriceRuleTargetRef } from '../interfaces/price-rule-target-ref.interface.js';

const MINUTES_PER_DAY = 1440;

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

function normalizeValue(valueType: PriceValueType, raw: string): string {
  let value: Prisma.Decimal;
  try {
    value = new Prisma.Decimal(raw);
  } catch {
    return invalid('value');
  }
  const max =
    valueType === PriceValueType.PERCENT
      ? PRICE_RULE_MAX_PERCENT
      : PRICE_RULE_MAX_AMOUNT;
  if (!value.isFinite() || value.lte(0) || value.decimalPlaces() > 2)
    invalid('value');
  if (value.gt(max)) invalid('value');
  return value.toFixed(2);
}

function normalizeTargets(input: PriceRuleInputDto): PriceRuleTargetRef[] {
  const targets = (input.targets ?? []).map((target) => ({
    type: target.type as PriceRuleTargetType,
    id: target.id,
    excluded: target.excluded === true,
  }));
  if (targets.length > PRICE_RULE_MAX_TARGETS) invalid('targets');
  const keys = new Set(targets.map((target) => `${target.type}:${target.id}`));
  if (keys.size !== targets.length) invalid('targets');
  if (input.appliesToAll) {
    // Applies to all: the list holds only exclusions.
    if (targets.some((target) => !target.excluded)) invalid('targets');
  } else if (
    targets.length === 0 ||
    targets.some((target) => target.excluded)
  ) {
    invalid('targets');
  }
  return targets;
}

/**
 * Checks a rule input against its schedule type and turns it into stored form
 * (docs/pricing-stage3-api.md). Fields of another schedule type are rejected, not ignored.
 * Throws 400 PRICE_RULE_INVALID with the offending field.
 */
export function normalizePriceRuleInput(
  input: PriceRuleInputDto,
): NormalizedPriceRule {
  const name = input.name?.trim() ?? '';
  if (name.length === 0) invalid('name');
  const note = input.note?.trim() || null;
  const value = normalizeValue(input.valueType, input.value);
  const yearly = input.yearly === true;
  const holidayExclusive = input.holidayExclusive === true;
  const dates = [...new Set(input.dates ?? [])];
  const hasDates = (input.dates ?? []).length > 0;
  const weekdaysMask = normalizeWeekdays(input.weekdays);
  const intervals = normalizeIntervals(input.intervals);
  const targets = normalizeTargets(input);

  let visitFrom: string | null = null;
  let visitTo: string | null = null;

  switch (input.scheduleType) {
    case PriceScheduleType.WEEKLY:
      if (yearly) invalid('yearly');
      if (holidayExclusive) invalid('holidayExclusive');
      if (hasDates) invalid('dates');
      if (weekdaysMask === 0) invalid('weekdays');
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
    appliesToAll: input.appliesToAll,
    targets,
  };
}
