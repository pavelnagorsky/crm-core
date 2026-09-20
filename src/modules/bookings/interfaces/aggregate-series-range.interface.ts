import { BookingStatus } from '@prisma/client';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { AggregateRange } from './aggregate-range.interface.js';

export interface AggregateSeriesRange extends AggregateRange {
  granularity: SeriesGranularity;
  timezone: string;
  statuses?: BookingStatus[];
}
