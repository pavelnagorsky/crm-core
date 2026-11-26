import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import {
  PRICE_CHANGE_MAX_DAYS_AHEAD,
  PRICE_CHANGE_MAX_PERCENT_BP,
  PRICE_CHANGE_MIN_PERCENT_BP,
} from '../constants/price-change.constants.js';
import { ServicePriceChangeSpecDto } from '../dto/service-price-change-spec.dto.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';

export function priceChangeInvalid(field: string): AppException {
  return new AppException(
    ErrorCode.PRICE_CHANGE_INVALID,
    HttpStatus.BAD_REQUEST,
    { field },
  );
}

/**
 * Parses and bounds a rule. 400 PRICE_CHANGE_INVALID { field } for an empty scope
 * (`scope`) or a value that does not fit the mode (`value`). The date is checked apart,
 * against the location today.
 */
export function parsePriceChangeSpec(
  dto: ServicePriceChangeSpecDto,
): PriceChangeSpec {
  if (
    !dto.allServices &&
    dto.serviceIds.length === 0 &&
    dto.categoryIds.length === 0 &&
    dto.bundleIds.length === 0
  )
    throw priceChangeInvalid('scope');
  return {
    allServices: dto.allServices,
    serviceIds: [...new Set(dto.serviceIds)],
    categoryIds: [...new Set(dto.categoryIds)],
    bundleIds: [...new Set(dto.bundleIds)],
    mode: dto.mode,
    value: parsePriceChangeValue(dto.mode, dto.value),
    step: MoneyUtils.toMinor(dto.priceRoundingStep),
    include: { ...dto.include },
    effectiveDate: dto.effectiveDate,
  };
}

/**
 * The value of a rule of either catalog in minor units (PERCENT: basis points). 400
 * PRICE_CHANGE_INVALID { field: 'value' } when it does not fit the mode.
 */
export function parsePriceChangeValue(
  mode: PriceChangeMode,
  raw: string | null,
): number | null {
  const value = raw === null ? null : MoneyUtils.toMinor(raw);
  switch (mode) {
    case PriceChangeMode.PERCENT:
      if (
        value === null ||
        value < PRICE_CHANGE_MIN_PERCENT_BP ||
        value > PRICE_CHANGE_MAX_PERCENT_BP
      )
        throw priceChangeInvalid('value');
      break;
    case PriceChangeMode.AMOUNT:
      if (value === null || Math.abs(value) > PRICE_MAX_MINOR)
        throw priceChangeInvalid('value');
      break;
    case PriceChangeMode.SET:
      if (value !== null && (value < 0 || value > PRICE_MAX_MINOR))
        throw priceChangeInvalid('value');
      break;
  }
  return value;
}

/** Last date a change can be planned for, from the location today. */
export function maxPriceChangeDate(today: string): string {
  return TimeUtils.addDaysStr(today, PRICE_CHANGE_MAX_DAYS_AHEAD);
}

/**
 * 400 PRICE_CHANGE_DATE_INVALID { today, maxDate } unless the date is after the
 * location today and at most two years ahead. Null (apply now) is always fine.
 */
export function assertPriceChangeDate(
  effectiveDate: string | null,
  today: string,
): void {
  if (effectiveDate === null) return;
  const maxDate = maxPriceChangeDate(today);
  if (effectiveDate <= today || effectiveDate > maxDate)
    throw new AppException(
      ErrorCode.PRICE_CHANGE_DATE_INVALID,
      HttpStatus.BAD_REQUEST,
      { today, maxDate },
    );
}
