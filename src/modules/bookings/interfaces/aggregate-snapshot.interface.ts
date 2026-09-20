import { BookingStatus } from '@prisma/client';

export interface AggregateSnapshot {
  byStatus: Map<BookingStatus, { count: number; revenue: number }>;
  totalCount: number;
  totalRevenue: number;
}
