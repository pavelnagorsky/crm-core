import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../validation/error-codes.enum.js';
import { BookingItemStaffAssignment } from './interfaces/booking-item-staff-assignment.interface.js';

/** Resolves only explicit replacements; omitted items keep their saved staff. */
export function resolveItemStaffAssignments(
  itemIds: readonly string[],
  executionMode: string,
  staffId?: string | null,
  assignments?: readonly BookingItemStaffAssignment[] | null,
): Map<string, string> {
  if (staffId && executionMode === 'PARALLEL' && itemIds.length > 1) {
    throw new AppException(
      ErrorCode.BOOKING_PARALLEL_STAFF_REQUIRED,
      HttpStatus.BAD_REQUEST,
    );
  }
  if (staffId && assignments?.length) {
    throw new AppException(
      ErrorCode.BOOKING_STAFF_ASSIGNMENT_CONFLICT,
      HttpStatus.BAD_REQUEST,
    );
  }
  const known = new Set(itemIds);
  const requested = new Map<string, string>();
  for (const assignment of assignments ?? []) {
    if (
      !known.has(assignment.bookingItemId) ||
      requested.has(assignment.bookingItemId)
    ) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    requested.set(assignment.bookingItemId, assignment.staffId);
  }
  if (staffId) {
    for (const id of itemIds) requested.set(id, staffId);
  }
  return requested;
}
