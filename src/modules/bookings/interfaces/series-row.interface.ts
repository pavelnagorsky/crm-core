import { BookingStatus, Prisma } from '@prisma/client';

export interface SeriesRow {
  bucket: Date;
  status: BookingStatus | null;
  count: number;
  revenue: Prisma.Decimal;
  duration: number;
}
