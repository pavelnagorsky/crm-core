import { Prisma } from '@prisma/client';
import { PromotionNotReturnedClient } from './promotion-not-returned-client.interface.js';
import { PromotionReportStaff } from './promotion-report-staff.interface.js';

/** Results of one promotion over a period (docs/pricing-stage4-api.md, «Страница акции»). */
export interface PromotionReport {
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
  bookingsCount: number;
  clientsCount: number;
  newClients: number;
  returningClients: number;
  /** discount / bookingsCount; 0 without bookings. */
  avgDiscount: Prisma.Decimal;
  /** Share (0-1) of clients 14+ days after a completed promotion visit who booked again without it. */
  returnedRate: number | null;
  staff: PromotionReportStaff[];
  notReturned: { count: number; items: PromotionNotReturnedClient[] };
}
