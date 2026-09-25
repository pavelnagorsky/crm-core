import { BookingStatus, Prisma } from '@prisma/client';

export interface AggregateSnapshot {
  byStatus: Map<BookingStatus, { count: number; revenue: Prisma.Decimal; duration: number }>;
  totalCount: number;
  totalRevenue: Prisma.Decimal;
  totalDuration: number;
}
