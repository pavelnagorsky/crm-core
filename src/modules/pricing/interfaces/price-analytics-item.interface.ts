import { Prisma } from '@prisma/client';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../enums/price-analytics-source.enum.js';
import { PriceAnalyticsBreakdown } from './price-analytics-breakdown.interface.js';

/** A booking service or a product line of the report with its split price. */
export interface PriceAnalyticsItem extends PriceAnalyticsBreakdown {
  /** bookingItemId or orderItemId. */
  id: string;
  itemType: PriceAnalyticsItemType;
  source: PriceAnalyticsSource;
  bookingId: string | null;
  orderId: string | null;
  /** Visit start or confirmedAt. */
  at: Date;
  title: string;
  /** Product lines only. */
  quantity: Prisma.Decimal | null;
  clientId: string | null;
  clientName: string | null;
  staffId: string | null;
  /** Name at the time of the item. */
  staffName: string | null;
  /** A product line with a partial return; the amounts are already net of it. */
  returned: boolean;
}
