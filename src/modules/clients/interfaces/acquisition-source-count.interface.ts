import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

/** New clients of a brand from one source; null source means not specified. */
export interface AcquisitionSourceCount {
  source: TrafficSource | null;
  count: number;
}
