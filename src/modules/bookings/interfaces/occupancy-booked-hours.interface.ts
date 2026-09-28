export interface OccupancyBookedHours {
  /** Minutes of visits that already happened and were not cancelled/no-show (startAt < now). */
  pastHeldMinutes: number;
  /** Minutes of future confirmed visits (startAt >= now). */
  futureConfirmedMinutes: number;
}
