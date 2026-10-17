import { PayrollPeriodStatus, Prisma } from '@prisma/client';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';

/** Periods that reject a new earning on a date inside their range. */
export const LOCKED_PAYROLL_STATUSES: PayrollPeriodStatus[] = [
  PayrollPeriodStatus.APPROVED,
  PayrollPeriodStatus.PAID,
];

export function lockedPeriodWhere(
  locationId: string,
  earnedOn?: Date,
): Prisma.PayrollPeriodWhereInput {
  return {
    locationId,
    location: ACTIVE_LOCATION_WHERE,
    status: { in: LOCKED_PAYROLL_STATUSES },
    ...(earnedOn
      ? { startDate: { lte: earnedOn }, endDate: { gte: earnedOn } }
      : {}),
  };
}
