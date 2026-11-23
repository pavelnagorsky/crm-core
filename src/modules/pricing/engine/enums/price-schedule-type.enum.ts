/** Mirror of Prisma PriceScheduleType: how a price rule picks its days. */
export enum PriceScheduleType {
  /** Weekdays and hours, optional visit period. */
  WEEKLY = 'WEEKLY',
  /** A date range, optionally every year (may cross the new year). */
  SEASON = 'SEASON',
  /** A list of dates, optionally every year. */
  HOLIDAYS = 'HOLIDAYS',
}
