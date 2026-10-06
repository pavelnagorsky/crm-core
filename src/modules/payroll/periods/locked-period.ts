import { PayrollPeriodStatus, Prisma } from '@prisma/client';

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
    status: { in: LOCKED_PAYROLL_STATUSES },
    ...(earnedOn
      ? { startDate: { lte: earnedOn }, endDate: { gte: earnedOn } }
      : {}),
  };
}
