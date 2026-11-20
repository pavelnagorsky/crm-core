import { Prisma } from '@prisma/client';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

/** Bookings created in a period from one source, or one source and lowercase detail. */
export interface TrafficSourceTotalsRow {
  /** Null: bookings without a source (manual ones where staff picked none). */
  source: TrafficSource | null;
  /** Lowercase detail on a detail row; null on a source row and on the total. */
  detail: string | null;
  bookings: number;
  /** Bookings made through a booking page or widget, the conversion numerator. */
  channelBookings: number;
  /** Bookings that acquired their client: the client's first booking in the brand. */
  newClients: number;
  completedVisits: number;
  completedRevenue: Prisma.Decimal;
}
