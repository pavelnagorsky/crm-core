import { SeriesRow } from '../../interfaces/series-row.interface.js';
import { OccupancyHeadline } from './occupancy-headline.interface.js';

export interface OccupancyData extends OccupancyHeadline {
  bookedByBucket: SeriesRow[];
}
