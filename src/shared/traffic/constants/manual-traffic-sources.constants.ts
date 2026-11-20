import { TrafficSource } from '../enums/traffic-source.enum.js';

/** Sources staff may pick for a manual booking: everything except a direct visit to the site. */
export const MANUAL_TRAFFIC_SOURCES: readonly TrafficSource[] = Object.values(
  TrafficSource,
).filter((source) => source !== TrafficSource.DIRECT);
