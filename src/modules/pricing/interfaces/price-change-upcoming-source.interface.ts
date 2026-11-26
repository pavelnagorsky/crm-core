import { PriceChangeTarget } from '@prisma/client';

/** A scheduled change as the upcoming hints read it, in creation order within a date. */
export interface PriceChangeUpcomingSource {
  id: string;
  /** YYYY-MM-DD */
  effectiveDate: string;
  items: {
    targetType: PriceChangeTarget;
    serviceId: string | null;
    bundleId: string | null;
    /** Minor units; null: removes a level or personal price. */
    afterPrice: number | null;
  }[];
}
