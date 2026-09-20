import { BookingSource } from '@prisma/client';

export interface SourceCount {
  source: BookingSource;
  count: number;
}
