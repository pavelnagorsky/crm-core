import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import {
  PAYMENT_DATE_FUTURE_TOLERANCE_MS,
  PAYMENT_DATE_MAX_PAST_DAYS,
} from '../constants/payment.constants.js';

const DAY_MS = 86_400_000;

/** A payment date set by hand: not after now plus 5 minutes, not older than 366 days. */
export function assertPaymentDate(occurredAt: Date, now: Date): void {
  const time = occurredAt.getTime();
  if (
    Number.isNaN(time) ||
    time > now.getTime() + PAYMENT_DATE_FUTURE_TOLERANCE_MS ||
    time < now.getTime() - PAYMENT_DATE_MAX_PAST_DAYS * DAY_MS
  )
    throw new AppException(
      ErrorCode.PAYMENT_DATE_INVALID,
      HttpStatus.BAD_REQUEST,
    );
}

/** Explicit payment date: location wall time without offset, checked against the limits. */
export function resolvePaymentDate(
  local: string | null | undefined,
  timezone: string,
  now: Date,
): Date | null {
  if (!local) return null;
  const occurredAt = TimeUtils.localToUtc(local, timezone);
  assertPaymentDate(occurredAt, now);
  return occurredAt;
}

/**
 * Default date of a visit payment: now for a visit of today or later (location day),
 * the visit start for a visit of a past day.
 */
export function defaultVisitPaymentDate(
  startAt: Date,
  now: Date,
  timezone: string,
): Date {
  return isPastDay(startAt, now, timezone) ? startAt : now;
}

/** Default date of a sale payment: the sale date for a sale of a past day, otherwise now. */
export function defaultSalePaymentDate(
  orderOccurredAt: Date,
  now: Date,
  timezone: string,
): Date {
  return isPastDay(orderOccurredAt, now, timezone) ? orderOccurredAt : now;
}

function isPastDay(value: Date, now: Date, timezone: string): boolean {
  return (
    TimeUtils.zonedDateStr(value, timezone) <
    TimeUtils.zonedDateStr(now, timezone)
  );
}
