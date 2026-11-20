import { TrafficSource } from '../enums/traffic-source.enum.js';

export interface TrafficClassification {
  source: TrafficSource;
  /** Lowercase, safe characters only, at most 64; null when the source says it all. */
  detail: string | null;
}
