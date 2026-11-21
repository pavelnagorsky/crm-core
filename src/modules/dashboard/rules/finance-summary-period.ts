import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

const MAX_DAYS = 62;
const DAY_MS = 86_400_000;

/**
 * A finance summary covers whole days `from`..`to` inclusive: 400 DASHBOARD_CUSTOM_RANGE_INVALID
 * when `to` is before `from`, 400 FINANCE_SUMMARY_RANGE_TOO_LONG beyond 62 days.
 */
export function assertFinanceSummaryPeriod(from: string, to: string): void {
  const days =
    (TimeUtils.dateOnly(to).getTime() - TimeUtils.dateOnly(from).getTime()) /
      DAY_MS +
    1;
  if (days < 1)
    throw new AppException(
      ErrorCode.DASHBOARD_CUSTOM_RANGE_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  if (days > MAX_DAYS)
    throw new AppException(
      ErrorCode.FINANCE_SUMMARY_RANGE_TOO_LONG,
      HttpStatus.BAD_REQUEST,
    );
}
