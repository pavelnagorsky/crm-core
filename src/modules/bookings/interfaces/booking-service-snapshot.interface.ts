import { Prisma } from '@prisma/client';

export interface BookingServiceSnapshot {
  id: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: Prisma.Decimal;
}
