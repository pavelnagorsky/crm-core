import { Prisma } from '@prisma/client';

export interface ResolvedBookingItem {
  serviceId: string;
  staffId: string;
  sortOrder: number;
  startAt: Date;
  endAt: Date;
  serviceTitle: string;
  serviceDuration: number;
  listPrice: Prisma.Decimal;
  chargedPrice: Prisma.Decimal;
  customPrice: Prisma.Decimal | string | null;
  staffName: string;
}
