import { BookingStatus } from '@prisma/client';

export interface AggregateSnapshot {
  byStatus: Map<BookingStatus, { count: number; revenue: number; duration: number }>;
  totalCount: number;
  totalRevenue: number;
  totalDuration: number;
}
