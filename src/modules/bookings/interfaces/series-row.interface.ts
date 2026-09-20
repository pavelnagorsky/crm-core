import { BookingStatus } from '@prisma/client';

export interface SeriesRow {
  bucket: Date;
  status: BookingStatus | null;
  count: number;
  revenue: number;
  duration: number;
}
