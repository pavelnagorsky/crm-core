import { Location, Prisma } from '@prisma/client';
import { OrderTotals } from './order-totals.interface.js';

export interface ResolvedOrderDraft {
  location: Location;
  bookingId: string | null;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  occurredAt: Date;
  note: string | null;
  items: Prisma.OrderItemCreateWithoutOrderInput[];
  totals: OrderTotals;
}
