import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { CompensationVersionSpan } from './interfaces/compensation-version-span.interface.js';

export function assertCompensationVersionStart(
  latest: CompensationVersionSpan | null,
  effectiveFrom: Date,
): void {
  if (!latest) return;
  if (latest.effectiveFrom >= effectiveFrom) {
    throw new AppException(ErrorCode.COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID, HttpStatus.CONFLICT);
  }
  if (latest.effectiveTo !== null && latest.effectiveTo >= effectiveFrom) {
    throw new AppException(ErrorCode.COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID, HttpStatus.CONFLICT);
  }
}

export function planCoversDate(plan: CompensationVersionSpan, day: Date): boolean {
  return plan.effectiveFrom <= day && (plan.effectiveTo === null || plan.effectiveTo >= day);
}
