/** A local date in the forms the rule checks compare. */
export interface CalendarDay {
  /** YYYY-MM-DD. */
  date: string;
  /** YYYYMMDD as a number, for full-date ranges and holidays. */
  ymd: number;
  /** MMDD as a number, for yearly ranges and holidays. */
  md: number;
  /** ISO weekday, 1 (Monday) - 7 (Sunday). */
  isoWeekday: number;
}
