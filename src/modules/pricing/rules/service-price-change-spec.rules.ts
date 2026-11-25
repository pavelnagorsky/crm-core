import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import {
  SERVICE_PRICE_CHANGE_MAX_DAYS_AHEAD,
  SERVICE_PRICE_CHANGE_MAX_PERCENT_BP,
  SERVICE_PRICE_CHANGE_MIN_PERCENT_BP,
} from '../constants/service-price-change.constants.js';
import { ServicePriceChangeSpecDto } from '../dto/service-price-change-spec.dto.js';
import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';

function invalid(field: string): AppException {
  return new AppException(
    ErrorCode.SERVICE_PRICE_CHANGE_INVALID,
    HttpStatus.BAD_REQUEST,
    { field },
  );
}

/**
 * Parses and bounds a rule. 400 SERVICE_PRICE_CHANGE_INVALID { field } for an empty scope
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
    throw invalid('scope');
  const value = dto.value === null ? null : MoneyUtils.toMinor(dto.value);
  switch (dto.mode) {
    case ServicePriceChangeMode.PERCENT:
      if (
        value === null ||
        value < SERVICE_PRICE_CHANGE_MIN_PERCENT_BP ||
        value > SERVICE_PRICE_CHANGE_MAX_PERCENT_BP
      )
        throw invalid('value');
      break;
    case ServicePriceChangeMode.AMOUNT:
      if (value === null || Math.abs(value) > PRICE_MAX_MINOR)
        throw invalid('value');
      break;
    case ServicePriceChangeMode.SET:
      if (value !== null && (value < 0 || value > PRICE_MAX_MINOR))
        throw invalid('value');
      break;
  }
  return {
    allServices: dto.allServices,
    serviceIds: [...new Set(dto.serviceIds)],
    categoryIds: [...new Set(dto.categoryIds)],
    bundleIds: [...new Set(dto.bundleIds)],
    mode: dto.mode,
    value,
    step: MoneyUtils.toMinor(dto.priceRoundingStep),
    include: { ...dto.include },
    effectiveDate: dto.effectiveDate,
  };
}

/** Last date a change can be planned for, from the location today. */
export function maxPriceChangeDate(today: string): string {
  return TimeUtils.addDaysStr(today, SERVICE_PRICE_CHANGE_MAX_DAYS_AHEAD);
}

/**
 * 400 SERVICE_PRICE_CHANGE_DATE_INVALID { today, maxDate } unless the date is after the
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
      ErrorCode.SERVICE_PRICE_CHANGE_DATE_INVALID,
      HttpStatus.BAD_REQUEST,
      { today, maxDate },
    );
}
