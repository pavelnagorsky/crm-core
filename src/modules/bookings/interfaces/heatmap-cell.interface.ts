export interface HeatmapCell {
  /** ISO weekday: 1=Monday..7=Sunday. */
  weekday: number;
  /** Hour of day in business timezone: 0..23. */
  hour: number;
  count: number;
}
