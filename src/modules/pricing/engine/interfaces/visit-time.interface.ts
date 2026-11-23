/** Local start of a visit in the location time zone. */
export interface VisitTime {
  /** YYYY-MM-DD. */
  date: string;
  /** Minute of the local day, 0-1439. */
  minute: number;
}
