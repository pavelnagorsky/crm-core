import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../validation/error-codes.enum.js';
import { StaffAssignment } from './interfaces/staff-assignment.interface.js';

export function normalizeStaffAssignments(
  serviceIds: readonly string[],
  executionMode: string,
  staffId?: string | null,
  assignments?: readonly StaffAssignment[] | null,
  manualItems: readonly StaffAssignment[] = [],
): Map<string, string> {
  if (executionMode === 'PARALLEL' && serviceIds.length > 1 && staffId) {
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
  const known = new Set(serviceIds);
  const seen = new Set<string>();
  const requested = new Map<string, string>();
  for (const assignment of assignments ?? []) {
    if (!known.has(assignment.serviceId) || seen.has(assignment.serviceId)) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    seen.add(assignment.serviceId);
    if (assignment.staffId)
      requested.set(assignment.serviceId, assignment.staffId);
  }
  for (const item of manualItems) {
    if (!item.staffId) continue;
    if (
      seen.has(item.serviceId) &&
      requested.get(item.serviceId) !== item.staffId
    ) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  for (const id of serviceIds) {
    if (staffId && !requested.has(id)) requested.set(id, staffId);
  }
  const explicitStaff = serviceIds
    .map((id, index) => manualItems[index]?.staffId ?? requested.get(id))
    .filter((id): id is string => Boolean(id));
  if (
    executionMode === 'PARALLEL' &&
    new Set(explicitStaff).size !== explicitStaff.length
  ) {
    throw new AppException(
      ErrorCode.BOOKING_STAFF_ASSIGNMENT_OVERLAP,
      HttpStatus.BAD_REQUEST,
    );
  }
  return requested;
}
